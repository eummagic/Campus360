import { api, cell, message } from "./records-api.js";
window.addEventListener("pageshow", async () => {
  document.querySelector("#details").replaceChildren(); document.querySelector("#enrolments").replaceChildren();
  document.querySelector("#enrolment-status").textContent = ""; message("Loading details…");
  try {
    const query = new URLSearchParams(location.search);
    if ([...query.keys()].some((key) => key !== "id") || query.getAll("id").length > 1) throw new Error("Invalid student detail link.");
    const id = query.has("id") ? query.get("id") : (await api("/api/student/me")).student.id;
    const data = await api(`/api/directory/${encodeURIComponent(id)}`);
    const student = data.student;
    document.querySelector("#details").replaceChildren(...[
      ["Name", student.name], ["Email", student.email], ["Registration", student.registrationNumber],
      ["Program", `${student.program.code} — ${student.program.name}`], ["Status", student.status],
    ].map(([label, value]) => {
      const group = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd");
      dt.textContent = label; dd.textContent = value; group.append(dt, dd); return group;
    }));
    document.querySelector("#enrolments").replaceChildren(...data.enrolments.map((item) => {
      const row = document.createElement("tr");
      for (const value of [`${item.subjectCode} — ${item.subjectName}`, item.section, item.term, item.credits]) cell(row, value);
      return row;
    }));
    document.querySelector("#enrolment-status").textContent = data.enrolmentStatus === "not_provisioned"
      ? `Enrolment information is not provisioned. Missing collections: ${data.missingCollections.join(", ")}.`
      : data.enrolments.length ? `${data.enrolments.length} enrolment(s).` : "No enrolments are recorded.";
    message("Student details loaded.");
  } catch (error) { message(error.message, true); }
});
