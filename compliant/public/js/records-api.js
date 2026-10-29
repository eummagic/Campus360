export async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 404 && data.error === "Not found."
    ? "API route unavailable (HTTP 404). Restart the local backend to load the current application."
    : response.status === 401 ? "Sign in through the portal first."
    : response.status === 403 ? "You do not have permission to view or change this information."
      : data.error || "Request unavailable.");
  return data;
}
export function message(text, error = false) {
  const element = document.querySelector("#status");
  element.textContent = text;
  element.dataset.kind = error ? "error" : "success";
}
export function cell(row, value) {
  const td = document.createElement("td"); td.textContent = value ?? "Not recorded"; row.append(td); return td;
}
