import { api, message } from "./records-api.js";
const form = document.querySelector("#profile-form"); const button = form.querySelector("button");
window.addEventListener("pageshow", async () => {
  button.disabled = true; form.reset(); document.querySelector("#email").textContent = "";
  try {
    const profile = await api("/api/profile"); form.elements.displayName.value = profile.displayName;
    document.querySelector("#email").textContent = profile.email; button.disabled = false;
  } catch (error) { message(error.message, true); }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault(); button.disabled = true; message("Saving…");
  try {
    const session = await api("/api/auth/session");
    const result = await api("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ displayName: form.elements.displayName.value }) });
    form.elements.displayName.value = result.displayName;
    message(result.changed ? "Display name saved with an audit event." : "Display name is unchanged.");
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
});
