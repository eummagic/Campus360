import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
// DOM/control-flow model only; this does not verify a real browser or layout.
const raw = readFileSync(new URL("../../public/js/academic-management.js", import.meta.url), "utf8");
const header = 'import { api, cell } from "./records-api.js";';
assert.equal(raw.split(header).length, 2);
const source = raw.replace(header, "");
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(intercept = () => undefined) {
  const nodes = new Map(), events = new Map(), calls = [];
  function element() { return { disabled: false, textContent: "", dataset: {}, children: [], listeners: {},
    append(...v) { this.children.push(...v); }, replaceChildren(...v) { this.children = v; },
    addEventListener(type, fn) { this.listeners[type] = fn; } }; }
  for (const kind of ["terms", "subjects"]) {
    for (const part of ["form", "rows", "status", "result", "prev", "next"]) nodes.set("#" + kind + "-" + part, element());
    const form = nodes.get("#" + kind + "-form"), fieldset = element(), select = element();
    Object.defineProperty(select, "options", { get: () => select.children });
    form.elements = { program_id: select }; form.querySelector = () => fieldset; form.resets = 0; form.reset = () => { form.resets++; };
    form.fields = { name: "Term Draft", starts_on: "", ends_on: "", status: "planned" };
  }
  async function api(path, options = {}) {
    calls.push({ path, options }); const value = intercept(path, options); if (value !== undefined) return value;
    if (path.endsWith("/overview")) return { programs: [{ id: "b".repeat(24), code: "BCA", name: "Applications", status: "active" }] };
    if (path === "/api/auth/session") return { csrfToken: "synthetic" };
    if (options.method === "POST") return { record: { id: "a".repeat(24), name: JSON.parse(options.body).name } };
    return { records: [], hasMore: true };
  }
  vm.runInNewContext(source, { api, cell: (row, value) => row.append(value),
    document: { querySelector: (key) => nodes.get(key), createElement: element },
    window: { addEventListener: (key, fn) => events.set(key, fn) },
    Option: function (text, value) { this.text = text; this.value = value; },
    FormData: function (form) { return Object.entries(form.fields); },
  });
  const node = (kind, part) => nodes.get("#" + kind + "-" + part);
  return { calls, node, show: () => events.get("pageshow")(), hide: () => events.get("pagehide")(),
    submit: () => node("terms", "form").listeners.submit({ preventDefault() {}, currentTarget: node("terms", "form") }) };
}
test("history restore cancels a submission waiting for session verification before POST", async () => {
  const gate = deferred(), f = setup((path) => path === "/api/auth/session" ? gate.promise : undefined);
  await f.show(); const pending = f.submit(); await f.show(); gate.resolve({ csrfToken: "old" }); await pending;
  assert.equal(f.calls.filter((call) => call.options.method === "POST").length, 0);
  assert.equal(f.node("terms", "result").textContent, "");
});
test("an old create response cannot reset a new draft or show a stale success", async () => {
  const gate = deferred(), f = setup((_path, options) => options.method === "POST" ? gate.promise : undefined);
  await f.show(); const pending = f.submit(); await tick(); f.hide(); await f.show();
  const resets = f.node("terms", "form").resets; f.node("terms", "form").fields.name = "New draft";
  gate.resolve({ record: { id: "old", name: "Old term" } }); await pending;
  assert.equal(f.node("terms", "form").resets, resets); assert.equal(f.node("terms", "form").fields.name, "New draft");
  assert.equal(f.node("terms", "result").textContent, "");
});
test("late submission errors cannot repaint the restored page", async () => {
  const gate = deferred(), f = setup((_path, options) => options.method === "POST" ? gate.promise : undefined);
  await f.show(); const pending = f.submit(); await tick(); f.hide(); await f.show();
  gate.reject(Error("old connection error")); await pending; assert.equal(f.node("terms", "result").textContent, "");
});
test("pagehide invalidates pending reads before private rows can render", async () => {
  const gate = deferred(), f = setup((path) => path.includes("/terms?") ? gate.promise : undefined);
  await f.show(); f.hide(); gate.resolve({ records: [{ name: "Old term", status: "active" }], hasMore: false }); await tick();
  assert.equal(f.node("terms", "rows").children.length, 0); assert.equal(f.node("terms", "form").querySelector().disabled, true);
});
test("saving blocks repeat submissions/navigation, and errors preserve the draft", async () => {
  const gate = deferred(), f = setup((_path, options) => options.method === "POST" ? gate.promise : undefined);
  await f.show(); const pending = f.submit(); await tick(); await f.submit();
  assert.equal(f.calls.filter((call) => call.options.method === "POST").length, 1); assert.equal(f.node("terms", "next").disabled, true);
  f.node("terms", "next").listeners.click(); assert.equal(f.calls.some((call) => call.path.includes("offset=50")), false);
  gate.reject(Error("Duplicate term")); await pending;
  assert.equal(f.node("terms", "form").fields.name, "Term Draft");
  assert.match(f.node("terms", "result").textContent, /check the list before submitting again/);
  assert.equal(f.node("terms", "form").querySelector().disabled, false); assert.equal(f.node("terms", "next").disabled, false);
});
