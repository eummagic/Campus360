const status = document.querySelector("#status");
function rows(selector, values, columns) {
  const body = document.querySelector(selector);
  if (!values.length) values = [["No records configured.", ...Array(columns - 1).fill("")]];
  body.replaceChildren(...values.map((values) => {
    const row = document.createElement("tr");
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
}
async function load() {
  document.querySelector("#overview").hidden = true;
  try {
    const response = await fetch("/api/admin/academics/overview", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      status.textContent = response.status === 401 ? "Sign in through the portal to view this page."
        : response.status === 403 ? "Administrator access in the configured scope is required."
          : "Academic overview unavailable. Check server configuration and required collections.";
      status.dataset.kind = "error";
      return;
    }
    const departments = new Map(data.departments.map((row) => [row.id, row.code]));
    rows("#departments", data.departments.map((row) => [row.code, row.name, row.status]), 3);
    rows("#programs", data.programs.map((row) => [row.code, row.name, departments.get(row.departmentId), row.status]), 4);
    document.querySelector("#availability").replaceChildren(...data.otherCollections.map((item) => {
      const row = document.createElement("li");
      row.textContent = `${item.name}: ${item.status === "not_provisioned" ? "Not provisioned" : "Collection exists; feature not included in this stage"}`;
      return row;
    }));
    document.querySelector("#overview").hidden = false;
    status.textContent = "Academic reference data loaded.";
    delete status.dataset.kind;
  } catch {
    status.textContent = "Unable to load academic data. Check the local server connection.";
    status.dataset.kind = "error";
  }
}
// Clear stale data and re-authorize when returning through browser history.
window.addEventListener("pageshow", () => { void load(); });
