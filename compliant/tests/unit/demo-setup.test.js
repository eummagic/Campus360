import assert from "node:assert/strict";
import test from "node:test";
import { demoPlan, assertNewDatabase, assertOwnedContainer } from "../../scripts/setup-local-demo.js";
import { AUTH_INDEXES, COLLECTIONS, buildValidator } from "../../server/db/schema.js";
import { APP_SESSIONS_SPEC, APP_SESSIONS_VALIDATOR } from "../../server/db/app-sessions-schema.js";

test("setup defaults to a local plan and execution requires an explicit restricted database name", () => {
  const plan = demoPlan();
  assert.equal(plan.execute, false);
  assert.equal(plan.uri, "mongodb://127.0.0.1:27028/?replicaSet=campus360-demo-rs&directConnection=true");
  assert.equal(plan.scope, "demo");
  assert.throws(() => demoPlan(["--execute"]), /explicitly named/);
  assert.equal(demoPlan(["--execute", "--database", plan.database]).execute, true);
  for (const name of ["admin", "campus360", plan.database + "\n", "campus360_demo_20261029_ABCDEFGH"]) {
    assert.throws(() => demoPlan(["--database", name]), /Database must/);
  }
});

test("setup refuses arbitrary URI options, duplicate flags and ambiguous execution modes", () => {
  for (const args of [["--uri", "mongodb+srv://example.test"], ["--execute", "--plan"], ["--plan", "--plan"], ["--database"]]) {
    assert.throws(() => demoPlan(args));
  }
});

test("plan preserves the complete nine collection validators and fifteen index definitions", () => {
  const { collections } = demoPlan();
  assert.deepStrictEqual(collections.map(({ name }) => name), ["user", "account", "profiles", "user_roles", "audit_events", "departments", "programs", "student_records", "app_sessions"]);
  assert.equal(collections.reduce((count, spec) => count + spec.indexes.length, 0), 15);
  for (const spec of collections) {
    if (["user", "account"].includes(spec.name)) {
      assert.equal(spec.validator, null);
      assert.deepStrictEqual(spec.indexes, AUTH_INDEXES.find(({ collection }) => collection === spec.name).indexes);
    } else if (spec.name === "app_sessions") {
      assert.deepStrictEqual(spec.validator, APP_SESSIONS_VALIDATOR);
      assert.deepStrictEqual(spec.indexes, APP_SESSIONS_SPEC.indexes);
    } else {
      const original = COLLECTIONS.find(({ name }) => name === spec.name);
      assert.deepStrictEqual(spec.validator, buildValidator(original));
      assert.deepStrictEqual(spec.indexes, original.indexes);
    }
  }
});

test("database guard refuses existing targets, collections and unexpected user databases", () => {
  const plan = demoPlan();
  assert.doesNotThrow(() => assertNewDatabase(plan, ["admin", "local", "config"]));
  assert.throws(() => assertNewDatabase(plan, [plan.database]), /already exists/);
  assert.throws(() => assertNewDatabase(plan, ["other_project"]), /unexpected/);
  assert.throws(() => assertNewDatabase(plan, ["admin"], ["user"]), /already exists/);
});

test("container guard requires the exact image, run label, volume and loopback binding", () => {
  const plan = demoPlan();
  const info = { id: "a".repeat(64), image: "sha256:example", labels: { "io.campus360.demo": plan.database, "io.campus360.setup": "nonce" },
    ports: { "27017/tcp": [{ HostIp: "127.0.0.1", HostPort: "27028" }] },
    mounts: [{ Destination: "/data/db", Type: "volume", Name: plan.volume }, { Destination: "/data/configdb", Type: "tmpfs" }] };
  assert.doesNotThrow(() => assertOwnedContainer(plan, info, "nonce", "sha256:example"));
  for (const changes of [{ image: "other" }, { labels: {} }, { mounts: [] },
    { ports: { "27017/tcp": [{ HostIp: "0.0.0.0", HostPort: "27028" }] } }]) {
    assert.throws(() => assertOwnedContainer(plan, { ...info, ...changes }, "nonce", "sha256:example"), /Setup refused/);
  }
});
