import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFERRED_ACADEMIC_COLLECTIONS } from "../../server/db/academic-repository.js";
import { describeTimetableAvailability, describeTimetableError } from "../../public/js/timetable-state.js";

let browserTestId = 0;

function installBrowserStubs(t) {
  const previous = Object.fromEntries(["document", "window", "fetch"].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const elements = new Map(["timetable-status", "timetable-state-title", "timetable-state-detail", "timetable-retry", "portal-link"]
    .map((id) => [id, { id, dataset: {}, hidden: id === "timetable-retry" || id === "portal-link", listeners: {}, textContent: "",
      addEventListener(type, handler) { this.listeners[type] = handler; } }]));
  const windowListeners = {};
  globalThis.document = { querySelector(selector) { return elements.get(selector.slice(1)); } };
  globalThis.window = { addEventListener(type, handler) { windowListeners[type] = handler; } };
  return { elements, windowListeners };
}

async function loadTimetablePage() {
  const url = new URL("../../public/js/timetable.js", import.meta.url);
  url.searchParams.set("test", String(++browserTestId));
  await import(url.href);
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("timetable availability reads a collection exposed by the published overview contract", () => {
  assert.ok(DEFERRED_ACADEMIC_COLLECTIONS.includes("timetable_entries"));
  for (const status of ["not_provisioned", "not_included"]) {
    assert.equal(describeTimetableAvailability({
      otherCollections: [{ name: "timetable_entries", status }],
    }).state, status === "not_provisioned" ? "unconfigured" : "unavailable");
  }
});

test("timetable availability distinguishes missing storage from an existing unsupported feature", () => {
  assert.deepEqual(describeTimetableAvailability({ otherCollections: [
    { name: "timetable_entries", status: "not_provisioned" },
  ] }), {
    state: "unconfigured",
    title: "Timetable storage is not configured",
    detail: "The timetable_entries collection is not provisioned. No schedule data can be loaded.",
  });
  assert.equal(describeTimetableAvailability({ otherCollections: [
    { name: "timetable_entries", status: "not_included" },
  ] }).state, "unavailable");
});

test("timetable availability fails closed on missing or unfamiliar overview metadata", () => {
  for (const overview of [undefined, {}, { otherCollections: [] },
    { otherCollections: [{ name: "timetable_entries", status: "ready" }] }]) {
    assert.equal(describeTimetableAvailability(overview).state, "unknown");
    assert.equal(describeTimetableAvailability(overview).showRetry, true);
  }
});

test("timetable API failures expose sign-in, forbidden, stale-backend and retry states", () => {
  assert.equal(describeTimetableError({ status: 401 }).state, "unauthorized");
  assert.equal(describeTimetableError({ status: 401 }).showPortalLink, true);
  assert.equal(describeTimetableError({ status: 403 }).state, "unauthorized");
  assert.equal(describeTimetableError({ status: 404 }).showRetry, true);
  assert.equal(describeTimetableError({ status: 503 }).state, "error");
  assert.equal(describeTimetableError(new TypeError("offline")).showRetry, true);
});

test("timetable page is accessible, discoverable, responsive, and does not imply a schedule was loaded", async () => {
  const [page, styles, overview, script, stateModule, portal] = await Promise.all([
    readFile(new URL("../../public/pages/timetable.html", import.meta.url), "utf8"),
    readFile(new URL("../../public/css/app.css", import.meta.url), "utf8"),
    readFile(new URL("../../public/pages/academics.html", import.meta.url), "utf8"),
    readFile(new URL("../../public/js/timetable.js", import.meta.url), "utf8"),
    readFile(new URL("../../public/js/timetable-state.js", import.meta.url), "utf8"),
    readFile(new URL("../../public/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(page, /href="\/css\/app\.css"/);
  assert.match(page, /src="\/js\/timetable\.js"/);
  assert.match(page, /href="\/pages\/academics\.html"/);
  assert.match(overview, /href="\/pages\/timetable\.html"/);
  assert.match(portal, /href="\/pages\/academics\.html"/);
  assert.match(script, /from "\.\/records-api\.js"/);
  assert.match(script, /from "\.\/timetable-state\.js"/);
  assert.match(stateModule, /timetable_entries/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /id="timetable-retry"/);
  assert.match(page, /id="portal-link"/);
  assert.match(page, /schedule cannot be confirmed empty/);
  assert.match(page, /no class times or events have been invented/);
  assert.match(page, /<ol class="calendar-days" aria-label="Weekday calendar layout">/);
  assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /max-width: 900px\)[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /max-width: 600px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(overview, /href="\/pages\/timetable.html"/);
  assert.doesNotMatch(page, /CS101|BCA|08:00|09:00/);
});

test("a stale pageshow request cannot replace the latest availability status", async (t) => {
  const { elements, windowListeners } = installBrowserStubs(t);
  const pending = [];
  const paths = [];
  globalThis.fetch = (path) => { paths.push(path); return new Promise((resolve) => pending.push(resolve)); };
  await loadTimetablePage();

  windowListeners.pageshow();
  assert.match(elements.get("timetable-state-title").textContent, /Checking timetable/);
  await tick();
  assert.deepEqual(paths, ["/api/admin/academics/overview"]);
  windowListeners.pageshow();
  await tick();
  assert.deepEqual(paths, ["/api/admin/academics/overview", "/api/admin/academics/overview"]);
  assert.equal(pending.length, 2);

  pending[1](Response.json({ otherCollections: [{ name: "timetable_entries", status: "not_included" }] }));
  await tick(); await tick();
  assert.match(elements.get("timetable-state-title").textContent, /not available yet/);
  assert.equal(elements.get("timetable-retry").hidden, true);

  pending[0](Response.json({ error: "Unavailable" }, { status: 503 }));
  await tick(); await tick();
  assert.match(elements.get("timetable-state-title").textContent, /not available yet/);
});

test("retry is shown for a service failure and hides after a successful availability check", async (t) => {
  const { elements, windowListeners } = installBrowserStubs(t);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return requests === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json({ otherCollections: [{ name: "timetable_entries", status: "not_provisioned" }] });
  };
  await loadTimetablePage();

  windowListeners.pageshow();
  await tick(); await tick();
  assert.match(elements.get("timetable-state-title").textContent, /could not be loaded/);
  assert.equal(elements.get("timetable-retry").hidden, false);

  elements.get("timetable-retry").listeners.click();
  await tick(); await tick();
  assert.equal(requests, 2);
  assert.match(elements.get("timetable-state-title").textContent, /storage is not configured/);
  assert.equal(elements.get("timetable-retry").hidden, true);
});

test("page shows a portal sign-in action after an unauthenticated response", async (t) => {
  const { elements, windowListeners } = installBrowserStubs(t);
  globalThis.fetch = async () => Response.json({ error: "Authentication required." }, { status: 401 });
  await loadTimetablePage();
  windowListeners.pageshow();
  await tick(); await tick();
  assert.match(elements.get("timetable-state-title").textContent, /Sign in/);
  assert.equal(elements.get("portal-link").hidden, false);
  assert.equal(elements.get("portal-link").textContent, "Go to portal sign in");
});
