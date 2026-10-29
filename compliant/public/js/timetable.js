import { api } from "./records-api.js";
import { describeTimetableAvailability, describeTimetableError } from "./timetable-state.js";

const status = document.querySelector("#timetable-status");
const title = document.querySelector("#timetable-state-title");
const detail = document.querySelector("#timetable-state-detail");
const retry = document.querySelector("#timetable-retry");
const portalLink = document.querySelector("#portal-link");
let generation = 0;

function render(result) {
  title.textContent = result.title;
  detail.textContent = result.detail;
  status.dataset.kind = result.state === "error" || result.state === "unknown" || result.state === "unauthorized"
    ? "error" : result.state === "unavailable" || result.state === "unconfigured" ? "warning" : "success";
  retry.hidden = !result.showRetry;
  portalLink.hidden = !result.showPortalLink;
  if (result.portalLinkText) portalLink.textContent = result.portalLinkText;
}

async function load() {
  const current = ++generation;
  status.dataset.kind = "";
  title.textContent = "Checking timetable configuration…";
  detail.textContent = "Loading academic availability from the current server.";
  retry.hidden = true;
  portalLink.hidden = true;
  try {
    const overview = await api("/api/admin/academics/overview");
    if (current !== generation) return;
    render(describeTimetableAvailability(overview));
  } catch (error) {
    if (current !== generation) return;
    render(describeTimetableError(error));
  }
}

retry.addEventListener("click", () => { void load(); });
window.addEventListener("pageshow", () => { void load(); });
