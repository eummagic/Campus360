import { api, cell, message } from "./records-api.js";
const form = document.querySelector("#filters");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
let offset = 0;
let applied = new URLSearchParams();
let generation = 0;
async function load() {
  const current = ++generation;
  previous.disabled = true; next.disabled = true;
  document.querySelector("#results").replaceChildren();
  message("Loading students…");
  const query = new URLSearchParams(applied); query.set("offset", String(offset));
  try {
    const data = await api(`/api/directory?${query}`);
    if (current !== generation) return;
    document.querySelector("#results").replaceChildren(...data.students.map((student) => {
      const row = document.createElement("tr");
      const name = cell(row, ""); const link = document.createElement("a");
      link.className = "subtle-link"; link.textContent = student.name;
      link.href = `/pages/student.html?id=${encodeURIComponent(student.id)}`; name.append(link);
      cell(row, student.registrationNumber); cell(row, student.program.code); cell(row, student.status); return row;
    }));
    previous.disabled = offset === 0; next.disabled = !data.hasMore;
    message(data.students.length ? `Showing ${offset + 1}–${offset + data.students.length}.` : "No students match these filters.");
  } catch (error) { if (current === generation) message(error.message, true); }
}
form.addEventListener("submit", (event) => { event.preventDefault(); applied = new URLSearchParams(new FormData(form)); offset = 0; void load(); });
previous.addEventListener("click", () => { offset = Math.max(0, offset - 50); void load(); });
next.addEventListener("click", () => { offset += 50; void load(); });
window.addEventListener("pageshow", async () => {
  await load();
  try {
    const { programs } = await api("/api/admin/academics/overview");
    const select = document.querySelector("#program-filter"); const selected = select.value;
    select.replaceChildren(new Option("All programs", ""), ...programs.map((p) => new Option(`${p.code} — ${p.name}`, p.id)));
    select.value = selected;
  } catch { /* The directory request already reports access/configuration failures. */ }
});
