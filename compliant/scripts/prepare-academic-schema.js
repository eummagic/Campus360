import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { COLLECTIONS, buildValidator } from "../server/db/schema.js";
import { createMongoConnection } from "../server/db/connection.js";

const DATABASE = "campus360_demo_20261029_4f9c2b18";
const URI = "mongodb://127.0.0.1:27028/?replicaSet=campus360-demo-rs&directConnection=true";
const CONTAINER = "campus360-demo-20261029-4f9c2b18";
const CONTAINER_ID = "29a0149da21af9299570034fe7abf86cea2c9a7a894c1884fad982652a899489";
const IMAGE = "sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399";
const NONCE = "cea6f1c1-7a4d-44a6-8ee5-21313250533c";
const NAMES = ["academic_terms", "subjects", "course_offerings", "teaching_assignments", "enrolments"];
const BASELINE = ["user", "account", "profiles", "user_roles", "audit_events", "departments", "programs", "student_records", "app_sessions"];
const specs = () => NAMES.map((name) => COLLECTIONS.find((spec) => spec.name === name));

export function academicPlan(args = []) {
  let execute = false, explicitDatabase = false;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error("Duplicate preparation option.");
    seen.add(flag);
    if (flag === "--execute") execute = true;
    else if (flag === "--plan") { /* Offline default; no inspection or connection. */ }
    else if (flag === "--database") {
      if (args[++i] !== DATABASE) throw new Error("Unexpected database; preparation refused.");
      explicitDatabase = true;
    } else throw new Error("Unknown preparation option.");
  }
  if (execute && (seen.has("--plan") || !explicitDatabase)) throw new Error("Execution requires --execute and the explicitly approved --database, without --plan.");
  return { execute, collections: specs().map((spec) => ({ name: spec.name,
    validator: buildValidator(spec), validationLevel: "strict", validationAction: "error", indexes: spec.indexes })) };
}

export function assertAcademicConfiguration({ uri, database } = {}) {
  // Exact allowlist excludes credentials, hosted/multiple hosts, alternate ports,
  // URI database paths, query overrides and SRV/DNS discovery.
  if (uri !== URI || database !== DATABASE) throw new Error("Local demo target mismatch; preparation refused.");
}

export function assertAcademicContainer(info) {
  const ports = info?.ports?.["27017/tcp"];
  if (!/^(npipe|unix):\/\//.test(info?.socket ?? "") || info?.running !== true
    || info.id !== CONTAINER_ID || info.name !== `/${CONTAINER}` || info.image !== IMAGE
    || info.labels?.["io.campus360.demo"] !== DATABASE || info.labels?.["io.campus360.setup"] !== NONCE
    || Object.keys(info.ports ?? {}).length !== 1 || ports?.length !== 1
    || ports[0].HostIp !== "127.0.0.1" || ports[0].HostPort !== "27028"
    || info.mounts?.length !== 2
    || !info.mounts.some((m) => m.Type === "volume" && m.Name === `${CONTAINER}-data` && m.Destination === "/data/db")
    || !info.mounts.some((m) => m.Type === "tmpfs" && m.Destination === "/data/configdb")
    || info.volumeLabels?.["io.campus360.demo"] !== DATABASE || info.volumeLabels?.["io.campus360.setup"] !== NONCE) {
    throw new Error("Local demo container identity mismatch; preparation refused.");
  }
}

function inspectTarget() {
  const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    if (process.env.DOCKER_HOST && !/^(npipe|unix):\/\//.test(process.env.DOCKER_HOST)) throw new Error();
    const socket = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
    if (!/^(npipe|unix):\/\//.test(socket)) throw new Error();
    const [row] = JSON.parse(docker(["inspect", CONTAINER]));
    const [volume] = JSON.parse(docker(["volume", "inspect", `${CONTAINER}-data`]));
    return { socket, id: row.Id, name: row.Name, image: row.Image, running: row.State.Running,
      labels: row.Config.Labels, ports: row.HostConfig.PortBindings, mounts: row.Mounts, volumeLabels: volume.Labels };
  } catch { throw new Error("Local Docker inspection unavailable; nothing was prepared."); }
}

function assertExisting(spec, info, indexes) {
  const options = info.options ?? {};
  if (info.type !== "collection" || !isDeepStrictEqual(options.validator, spec.validator)
    || (options.validationLevel ?? "strict") !== "strict" || (options.validationAction ?? "error") !== "error"
    || Object.keys(options).some((key) => !["validator", "validationLevel", "validationAction"].includes(key))) {
    throw new Error(`Unexpected existing collection: ${spec.name}. No repair attempted.`);
  }
  const expected = [{ name: "_id_", key: { _id: 1 } }, ...spec.indexes];
  if (indexes.length !== expected.length) throw new Error(`Unexpected index set: ${spec.name}. No repair attempted.`);
  for (const index of expected) {
    const actual = indexes.find((row) => row.name === index.name);
    if (!actual || !isDeepStrictEqual(Object.entries(actual.key), Object.entries(index.key))
      || Boolean(actual.unique) !== Boolean(index.unique)
      || Object.keys(actual).some((key) => !["v", "ns", "name", "key", "unique"].includes(key))) {
      throw new Error(`Unexpected index: ${spec.name}/${index.name}. No repair attempted.`);
    }
  }
}

export class AcademicPreparationError extends Error {
  constructor(report) {
    super(JSON.stringify(report));
    this.name = "AcademicPreparationError";
    this.report = structuredClone(report);
  }
}

function safePrimary(error) {
  const allowed = new Set(["Existing demo baseline missing.", "Connected database identity mismatch.", "Replica-set identity mismatch."]);
  for (const spec of specs()) {
    allowed.add(`Unexpected existing collection: ${spec.name}. No repair attempted.`);
    allowed.add(`Unexpected index set: ${spec.name}. No repair attempted.`);
    allowed.add(`Unexpected collection appeared: ${spec.name}. No repair attempted.`);
    allowed.add(`Collection ownership unproven: ${spec.name}. Index creation refused.`);
    for (const name of ["_id_", ...spec.indexes.map((index) => index.name)]) allowed.add(`Unexpected index: ${spec.name}/${name}. No repair attempted.`);
  }
  if (allowed.has(error?.message)) return error.message;
  return "Preparation failed; no automatic retry, repair or cleanup was attempted.";
}

function confirmedRejection(error) {
  // Only explicit server rejections known not to create a collection. Timeouts,
  // transport errors and write-concern failures must stay uncertain.
  return error?.name === "MongoServerError" && [2, 9, 13, 48, 72, 73].includes(error.code)
    && !error.writeConcernError && !error.errInfo?.writeConcern;
}

export async function prepareAcademicSchema({ args = [], configuration, inspect = inspectTarget,
  connect = async (config) => {
    const connection = createMongoConnection(config);
    // connect() already closes a failed client internally.
    const handle = await connection.connect();
    return { ...handle, close: () => connection.close() };
  } } = {}) {
  const plan = academicPlan(args);
  if (!plan.execute) return { mode: "offline-plan", ...plan };
  assertAcademicConfiguration(configuration);
  assertAcademicContainer(await inspect());
  let handle;
  const report = { mode: "prepared", primaryError: null, shutdownError: null,
    confirmedCreated: [], confirmedNotCreated: [], uncertain: [], skipped: [],
    notAttempted: plan.collections.map((spec) => spec.name) };
  try {
    handle = await connect(configuration); // Existing readiness checks are read-only.
    const { db } = handle;
    if (db.databaseName !== DATABASE) throw new Error("Connected database identity mismatch.");
    const hello = await db.command({ hello: 1 });
    if (hello.setName !== "campus360-demo-rs" || hello.me !== "localhost:27017" || hello.isWritablePrimary !== true
      || !isDeepStrictEqual(hello.hosts, ["localhost:27017"])) throw new Error("Replica-set identity mismatch.");
    const infos = await db.listCollections().toArray();
    if (BASELINE.some((name) => !infos.some((row) => row.name === name && row.type === "collection"))) throw new Error("Existing demo baseline missing.");
    const missing = [];
    // Complete ALL preflight checks before the first DDL operation.
    for (const spec of plan.collections) {
      const info = infos.find((row) => row.name === spec.name);
      if (info) {
        assertExisting(spec, info, await db.collection(spec.name).indexes());
        report.skipped.push(spec.name);
        report.notAttempted = report.notAttempted.filter((name) => name !== spec.name);
      } else missing.push(spec);
    }
    for (const spec of missing) {
      if ((await db.listCollections({ name: spec.name }).toArray()).length) {
        report.confirmedNotCreated.push(spec.name);
        report.notAttempted = report.notAttempted.filter((name) => name !== spec.name);
        throw new Error(`Unexpected collection appeared: ${spec.name}. No repair attempted.`);
      }
      report.notAttempted = report.notAttempted.filter((name) => name !== spec.name);
      // Mark in-flight BEFORE sending: a rejected promise is not proof that
      // the server did not apply the request.
      report.uncertain.push({ name: spec.name, outcome: "creation-or-ownership-unconfirmed" });
      try {
        await db.createCollection(spec.name, { validator: spec.validator, validationLevel: "strict", validationAction: "error" });
      } catch (error) {
        if (confirmedRejection(error)) {
          report.uncertain = report.uncertain.filter((row) => row.name !== spec.name);
          report.confirmedNotCreated.push(spec.name);
        }
        throw error;
      }
      // MongoDB can acknowledge an identical pre-existing namespace. Neither
      // this reply nor a subsequent UUID/existence read proves who created it.
      report.uncertain[report.uncertain.length - 1].outcome = "existence-acknowledged-ownership-unproven";
      throw new Error(`Collection ownership unproven: ${spec.name}. Index creation refused.`);
    }
  } catch (error) {
    report.primaryError = safePrimary(error);
  } finally {
    if (handle) {
      try { await handle.close(); }
      catch { report.shutdownError = "MongoDB connection shutdown failed."; }
    }
  }
  if (report.primaryError || report.shutdownError) {
    report.mode = "refused-or-incomplete";
    throw new AcademicPreparationError(report);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await prepareAcademicSchema({ args: process.argv.slice(2), configuration: {
      uri: process.env.MONGODB_URI, database: process.env.MONGODB_DB,
    } });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
