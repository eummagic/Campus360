const $ = (selector) => document.querySelector(selector);
let session = null;
let generation = 0;

function notice(selector, message = "", error = false) {
  const element = $(selector);
  element.textContent = message;
  element.dataset.kind = error ? "error" : "success";
}
async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && session) headers["X-CSRF-Token"] = session.csrfToken;
  const response = await fetch(path, { method, headers, credentials: "same-origin",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function signedOut(message = "") {
  generation += 1;
  session = null;
  $("#portal-view").hidden = true;
  $("#login-view").hidden = false;
  $("#student-rows").replaceChildren();
  $("#student-profile").replaceChildren();
  $("#student-form").reset();
  notice("#login-status", message);
}
async function refreshStudents() {
  const current = generation;
  const { students } = await api("/api/admin/students");
  if (current !== generation || !session) return;
  const rows = students.map((student) => {
    const row = document.createElement("tr");
    for (const value of [student.name, student.registrationNumber, student.email,
      `${student.program.code} — ${student.program.name}`, student.status]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  });
  $("#student-rows").replaceChildren(...rows);
  $("#empty-students").hidden = students.length !== 0;
}
async function showPortal() {
  const current = ++generation;
  const capabilities = await api("/api/portal");
  if (current !== generation || !session) return;
  $("#login-view").hidden = true;
  $("#portal-view").hidden = false;
  $("#greeting").textContent = `Welcome, ${session.user.displayName}`;
  $("#identity").textContent = session.user.email;
  $("#admin-panel").hidden = !capabilities.canManageStudents;
  $("#student-panel").hidden = !capabilities.canViewStudent;
  notice("#portal-status");
  notice("#student-status");
  if (capabilities.canManageStudents) {
    const { programs } = await api("/api/admin/programs");
    if (current !== generation || !session) return;
    const select = $("#student-form select");
    const placeholder = new Option(programs.length ? "Choose a program" : "No active programs available", "");
    select.replaceChildren(placeholder, ...programs.map((program) => new Option(`${program.code} — ${program.name}`, program.id)));
    $("#student-form button").disabled = programs.length === 0;
    await refreshStudents();
  }
  if (capabilities.canViewStudent) {
    const { student } = await api("/api/student/me");
    if (current !== generation || !session) return;
    const fields = [["Full name", student.name], ["Email address", student.email],
      ["Registration number", student.registrationNumber], ["Program", `${student.program.code} — ${student.program.name}`], ["Status", student.status]];
    $("#student-profile").replaceChildren(...fields.map(([label, value]) => {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      group.append(term, detail);
      return group;
    }));
  }
  if (!capabilities.canManageStudents && !capabilities.canViewStudent) {
    notice("#portal-status", "No student page or student administration access is linked to this account.");
  }
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelector("button").disabled = true;
  notice("#login-status", "Signing in…");
  try {
    session = await api("/api/auth/login", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    form.elements.password.value = "";
    await showPortal();
  } catch (error) {
    if (session) notice("#portal-status", error.message, true);
    else notice("#login-status", error.message, true);
  } finally { form.querySelector("button").disabled = false; }
});
$("#student-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const current = generation;
  form.querySelector("button").disabled = true;
  notice("#student-status", "Creating student…");
  try {
    const { student } = await api("/api/admin/students", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    if (current !== generation || !session) return;
    form.elements.password.value = "";
    notice("#student-status", `${student.name} (${student.registrationNumber}) created. The account is ready for sign-in.`);
    try { await refreshStudents(); }
    catch { notice("#student-status", `Student ${student.registrationNumber} was created. Refresh the listing to confirm it.`, true); }
  } catch (error) {
    if (current === generation && session) notice("#student-status", error.message, true);
  } finally { form.querySelector("button").disabled = false; }
});
$("#refresh-students").addEventListener("click", async () => {
  try { await refreshStudents(); notice("#portal-status"); }
  catch (error) { notice("#portal-status", error.message, true); }
});
$("#logout").addEventListener("click", async () => {
  $("#logout").disabled = true;
  try { await api("/api/auth/logout", { method: "POST", body: {} }); signedOut("Signed out."); }
  catch (error) {
    if (error.status === 401) signedOut("Your session has expired. Please sign in again.");
    else notice("#portal-status", error.message, true);
  } finally { $("#logout").disabled = false; }
});
try { session = await api("/api/auth/session"); await showPortal(); }
catch (error) {
  if (session) notice("#portal-status", error.message, true);
  else if (error.status !== 401) notice("#login-status", error.message, true);
}
