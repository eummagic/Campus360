import { readFileSync } from "node:fs";

// Synthetic, isolated test data only. No runtime module imports this repository.
const { vectors: [vector] } = JSON.parse(
  readFileSync(new URL("./password-vectors.json", import.meta.url), "utf8"),
);
export const SYNTHETIC_PASSWORD = vector.password;

export function createSyntheticRepository() {
  const users = new Map();
  const credentials = new Map();
  const roles = new Map();
  const sessions = new Map();
  const failures = new Set();
  const calls = {};
  for (const name of ["admin", "student", "teacher", "dual", "otheradmin"]) {
    const id = `synthetic-${name}`;
    const email = `${name}@example.test`;
    users.set(id, { id, email, displayName: `Synthetic ${name}`, internalOnly: "not-public" });
    credentials.set(email, { userId: id, passwordHash: vector.hash });
    roles.set(id, name === "dual"
      ? [{ role: "student", scope: "demo" }, { role: "admin", scope: "demo" }]
      : [{ role: name === "otheradmin" ? "admin" : name, scope: name === "otheradmin" ? "other" : "demo" }]);
  }
  function operation(name, implementation) {
    return async (...args) => {
      calls[name] = (calls[name] ?? 0) + 1;
      if (failures.has(name)) throw new Error("synthetic repository secret/stack/environment detail");
      return structuredClone(implementation(...args));
    };
  }
  const repository = {
    findCredentialByEmail: operation("findCredentialByEmail", (email) => credentials.get(email) ?? null),
    findUserById: operation("findUserById", (id) => users.get(id) ?? null),
    listRoles: operation("listRoles", (id) => roles.get(id) ?? []),
    createSession: operation("createSession", (record) => {
      if (sessions.has(record.tokenHash)) throw new Error("Duplicate synthetic session");
      sessions.set(record.tokenHash, structuredClone(record));
    }),
    findSessionByHash: operation("findSessionByHash", (hash) => sessions.get(hash) ?? null),
    deleteSessionByHash: operation("deleteSessionByHash", (hash) => sessions.delete(hash)),
  };
  return { repository, users, credentials, roles, sessions, failures, calls };
}
