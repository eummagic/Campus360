// Liveness only: this response makes no claim about database availability.
export function healthHandler(_request, response) {
  return response
    .set("Cache-Control", "no-store")
    .status(200)
    .json({ status: "ok" });
}
