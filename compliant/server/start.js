import { createApp } from "./app.js";

// Keep the local foundation on loopback and separate from the existing app.
const host = "127.0.0.1";
const port = 3001;
const server = createApp().listen(port, host, () => {
  console.log(`Campus360 listening at http://${host}:${port}`);
});

server.on("error", () => {
  console.error("Campus360 could not start. Check that port 3001 is available.");
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close());
}
