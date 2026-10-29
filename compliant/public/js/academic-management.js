import { api, cell } from "./records-api.js";
const kinds = ["terms", "subjects"];
const state = Object.fromEntries(kinds.map((kind) => [kind, { offset: 0, ready: false, saving: false, generation: 0 }]));
let programs = new Map(); let programsReady = false; let pageGeneration = 0;
const node = (kind, part) => document.querySelector("#" + kind + "-" + part);
function notify(target, text, error = false) { target.textContent = text; target.dataset.kind = error ? "error" : "success"; }
function enabled(kind) { node(kind, "form").querySelector("fieldset").disabled = !state[kind].ready || state[kind].saving || (kind === "subjects" && !programsReady); }
async function load(kind) {
  const current = state[kind], generation = ++current.generation;
  current.ready = false; enabled(kind); node(kind, "rows").replaceChildren();
  node(kind, "prev").disabled = true; node(kind, "next").disabled = true;
  notify(node(kind, "status"), "Loading…");
  try {
    const result = await api("/api/admin/academics/" + kind + "?offset=" + current.offset);
    if (generation !== current.generation) return;
    for (const record of result.records) {
      const row = document.createElement("tr");
      const values = kind === "terms" ? [record.name, record.starts_on, record.ends_on, record.status]
        : [record.code, record.name, programs.get(record.program_id)?.code ?? record.program_id, record.credits, record.status];
      for (const value of values) cell(row, value);
      node(kind, "rows").append(row);
    }
    notify(node(kind, "status"), result.records.length ? "Showing " + result.records.length + " records (offset " + current.offset + ")." : "No records on this page.");
    current.ready = true; enabled(kind);
    node(kind, "prev").disabled = current.offset === 0;
    node(kind, "next").disabled = !result.hasMore;
  } catch (error) { if (generation === current.generation) notify(node(kind, "status"), error.message, true); }
}
for (const kind of kinds) {
  for (const [direction, delta] of [["prev", -50], ["next", 50]]) node(kind, direction).addEventListener("click", () => {
    state[kind].offset = Math.min(1000, Math.max(0, state[kind].offset + delta)); void load(kind);
  });
  node(kind, "form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!state[kind].ready || state[kind].saving) return;
    const form = event.currentTarget; const input = Object.fromEntries(new FormData(form));
    if (kind === "terms") { input.starts_on ||= null; input.ends_on ||= null; }
    else input.credits = input.credits === "" ? null : Number(input.credits);
    state[kind].saving = true; enabled(kind); notify(node(kind, "result"), "Saving…");
    try {
      const session = await api("/api/auth/session");
      const result = await api("/api/admin/academics/" + kind, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(input) });
      form.reset(); state[kind].offset = 0; await load(kind);
      notify(node(kind, "result"), "Created " + result.record.name + " with an audit event (ID " + result.record.id + ").");
    } catch (error) { notify(node(kind, "result"), error.message + " If the connection failed after submission, check the list before submitting again.", true); }
    finally { state[kind].saving = false; enabled(kind); }
  });
}
window.addEventListener("pageshow", async () => {
  const generation = ++pageGeneration; programsReady = false; programs = new Map();
  for (const kind of kinds) { state[kind].generation++; state[kind].ready = false; node(kind, "form").reset(); enabled(kind); node(kind, "rows").replaceChildren(); node(kind, "result").textContent = ""; }
  const select = node("subjects", "form").elements.program_id;
  select.replaceChildren(new Option("Select a program", ""));
  void load("terms");
  try {
    const overview = await api("/api/admin/academics/overview");
    if (generation !== pageGeneration) return;
    programs = new Map(overview.programs.map((program) => [program.id, program]));
    for (const program of overview.programs.filter((program) => program.status === "active")) select.append(new Option(program.code + " — " + program.name, program.id));
    programsReady = select.options.length > 1;
    notify(node("subjects", "result"), programsReady ? "" : "No active programs are available; subject creation is disabled.", !programsReady);
  } catch (error) { if (generation !== pageGeneration) return; notify(node("subjects", "result"), "Program choices unavailable: " + error.message, true); }
  if (generation === pageGeneration) await load("subjects");
});
