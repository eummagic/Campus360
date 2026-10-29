import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashPassword } from "../server/auth/hash-password.js";
import { AUTH_INDEXES, COLLECTIONS, buildValidator } from "../server/db/schema.js";
import { APP_SESSIONS_SPEC, APP_SESSIONS_VALIDATOR } from "../server/db/app-sessions-schema.js";

const exampleDatabase = "campus360_demo_20261029_4f9c2b18";
const image = "mongo:8.0.34-noble";
const replicaSet = "campus360-demo-rs";
const uri = `mongodb://127.0.0.1:27028/?replicaSet=${replicaSet}&directConnection=true`;
const environmentFile = fileURLToPath(new URL("../.env.demo", import.meta.url));
const applicationNames = ["profiles", "user_roles", "audit_events", "departments", "programs", "student_records"];

export function demoPlan(args = []) {
  let execute = false;
  let explicitDatabase = false;
  let database = exampleDatabase;
  let adminEmail = "demo.admin@example.test";
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (seen.has(option)) throw new Error("Duplicate setup option.");
    seen.add(option);
    if (option === "--execute") execute = true;
    else if (option === "--plan") { /* Default: no external operations. */ }
    else if (["--database", "--admin-email"].includes(option)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing setup option value.");
      if (option === "--database") { database = value; explicitDatabase = true; }
      else adminEmail = value;
    } else throw new Error("Unknown setup option. Only --plan, --execute, --database and --admin-email are accepted.");
  }
  if (seen.has("--plan") && execute) throw new Error("Choose plan or execute, not both.");
  if (execute && !explicitDatabase) throw new Error("Execution requires an explicitly named new database.");
  if (database.length !== 32 || !/^campus360_demo_[0-9]{8}_[0-9a-f]{8}$/.test(database)) {
    throw new Error("Database must be campus360_demo_YYYYMMDD_ followed by eight lowercase hex digits.");
  }
  if (adminEmail.length > 320 || adminEmail !== adminEmail.trim().toLowerCase()
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || /[\u0000-\u001f\u007f]/.test(adminEmail)) {
    throw new Error("Provide a valid lowercase administrator email.");
  }
  const container = database.replaceAll("_", "-");
  const collections = [
    ...AUTH_INDEXES.filter(({ collection }) => ["user", "account"].includes(collection))
      .map(({ collection: name, indexes }) => ({ name, validator: null, indexes })),
    ...COLLECTIONS.filter(({ name }) => applicationNames.includes(name))
      .map((spec) => ({ name: spec.name, validator: buildValidator(spec), indexes: spec.indexes })),
    { name: "app_sessions", validator: APP_SESSIONS_VALIDATOR, indexes: APP_SESSIONS_SPEC.indexes },
  ];
  return { execute, database, adminEmail, image, replicaSet, uri, container,
    volume: `${container}-data`, scope: "demo", collections,
    command: `node scripts/setup-local-demo.js --execute --database ${database} --admin-email ${adminEmail}` };
}

export function assertNewDatabase(plan, databaseNames, collectionNames = []) {
  if (databaseNames.includes(plan.database) || collectionNames.length
    || databaseNames.some((name) => !["admin", "config", "local"].includes(name))) {
    throw new Error("Setup refused: database already exists or the fresh server contains unexpected application data.");
  }
}

export function assertOwnedContainer(plan, info, nonce, imageId) {
  const bindings = info.ports?.["27017/tcp"];
  if (!/^[0-9a-f]{64}$/.test(info.id ?? "") || info.image !== imageId
    || info.labels?.["io.campus360.demo"] !== plan.database
    || info.labels?.["io.campus360.setup"] !== nonce
    || Object.keys(info.ports ?? {}).length !== 1 || bindings?.length !== 1
    || bindings[0].HostIp !== "127.0.0.1" || bindings[0].HostPort !== "27028"
    || info.mounts?.length !== 2
    || !info.mounts.some((mount) => mount.Destination === "/data/db" && mount.Type === "volume" && mount.Name === plan.volume)
    || !info.mounts.some((mount) => mount.Destination === "/data/configdb" && mount.Type === "tmpfs")) {
    throw new Error("Setup refused: container identity, storage or loopback binding does not match the approved target.");
  }
}

function docker(args, timeout = 10_000) {
  try { return execFileSync("docker", args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { throw new Error(`Docker setup step failed: ${args[0]} ${args[1] ?? ""}. No automatic cleanup or retry was attempted.`); }
}

async function passwordPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("An interactive terminal is required for hidden password entry.");
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: true });
  const abort = new AbortController();
  reader.once("SIGINT", () => abort.abort());
  process.stdout.write(label);
  try { return await reader.question("", { signal: abort.signal }); }
  finally { reader.close(); process.stdout.write("\n"); }
}

async function executeSetup(plan) {
  // No arbitrary URI or inherited application configuration is accepted.
  const endpoint = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
  if (!endpoint.startsWith("npipe://") && !endpoint.startsWith("unix://")) throw new Error("A local Docker socket is required.");
  if (docker(["version", "--format", "{{.Server.Os}}"]) !== "linux") throw new Error("A local Linux Docker engine is required.");
  if (docker(["ps", "-a", "--filter", `name=^/${plan.container}$`, "--format", "{{.ID}}"])
    || docker(["volume", "ls", "--filter", `name=^${plan.volume}$`, "--format", "{{.Name}}"])
    || existsSync(environmentFile)) throw new Error("Setup refused: container, volume or compliant/.env.demo already exists.");
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("Port 127.0.0.1:27028 is not free.")));
    probe.listen(27028, "127.0.0.1", () => probe.close(resolve));
  });
  const password = await passwordPrompt("New demo administrator password (hidden): ");
  const confirmation = await passwordPrompt("Confirm password (hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const passwordHash = await hashPassword(password);
  const nonce = randomUUID();
  let imageId;
  try { imageId = docker(["image", "inspect", "--format", "{{.Id}}", plan.image]); }
  catch { docker(["pull", plan.image], 180_000); imageId = docker(["image", "inspect", "--format", "{{.Id}}", plan.image]); }
  if (!/^sha256:[0-9a-f]{64}$/.test(imageId)) throw new Error("Invalid local image identity.");
  docker(["volume", "create", "--driver", "local", "--label", `io.campus360.demo=${plan.database}`,
    "--label", `io.campus360.setup=${nonce}`, plan.volume]);
  const volumeLabels = JSON.parse(docker(["volume", "inspect", "--format", "{{json .Labels}}", plan.volume]));
  if (volumeLabels?.["io.campus360.setup"] !== nonce) throw new Error("Volume ownership changed. Setup refused.");
  const containerId = docker(["run", "--detach", "--pull=never", "--restart", "unless-stopped", "--name", plan.container,
    "--label", `io.campus360.demo=${plan.database}`, "--label", `io.campus360.setup=${nonce}`,
    "--publish", "127.0.0.1:27028:27017", "--memory", "2g", "--cpus", "2",
    "--mount", `type=volume,source=${plan.volume},destination=/data/db`,
    "--mount", "type=tmpfs,destination=/data/configdb,tmpfs-size=33554432",
    imageId, "mongod", "--replSet", plan.replicaSet, "--bind_ip_all", "--wiredTigerCacheSizeGB", "0.25", "--oplogSize", "64"]);
  const info = JSON.parse(docker(["inspect", "--format", '{"id":{{json .Id}},"image":{{json .Image}},"labels":{{json .Config.Labels}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}}}', containerId]));
  assertOwnedContainer(plan, info, nonce, imageId);
  if (info.id !== containerId) throw new Error("Container ID changed. Setup refused.");
  docker(["exec", containerId, "mongosh", "--quiet", "--eval", `
    const config=db.adminCommand({getCmdLineOpts:1});
    if(config.parsed.replication.replSet!=="${plan.replicaSet}")throw new Error("Replica mismatch");
    const initiated=rs.initiate({_id:"${plan.replicaSet}",members:[{_id:0,host:"localhost:27017"}]});
    if(initiated.ok!==1)throw new Error("Replica initialization failed");
    let ready=false;for(let i=0;i<30;i++){if(db.hello().isWritablePrimary){ready=true;break;}sleep(500);}
    if(!ready)throw new Error("Primary election timed out");`], 30_000);
  const { MongoClient, ObjectId } = await import("mongodb");
  const client = new MongoClient(plan.uri, { serverSelectionTimeoutMS: 5000, timeoutMS: 10_000 });
  try {
    await client.connect();
    const hello = await client.db("admin").command({ hello: 1 });
    if (hello.setName !== plan.replicaSet || hello.me !== "localhost:27017" || hello.isWritablePrimary !== true) {
      throw new Error("Database endpoint identity mismatch. Setup refused.");
    }
    const inventory = await client.db("admin").command({ listDatabases: 1, nameOnly: true });
    const db = client.db(plan.database);
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    assertNewDatabase(plan, inventory.databases.map(({ name }) => name), existing.map(({ name }) => name));
    // Create-only DDL. Never collMod, update, upsert, delete or drop existing data.
    for (const spec of plan.collections) {
      await db.createCollection(spec.name, spec.validator ? { validator: spec.validator, validationLevel: "strict", validationAction: "error" } : {});
      if (spec.indexes.length) await db.collection(spec.name).createIndexes(spec.indexes);
    }
    const adminId = new ObjectId();
    const departmentId = new ObjectId();
    const programId = new ObjectId();
    const timestamp = new Date();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection("user").insertOne({ _id: adminId, name: "Demo Administrator", email: plan.adminEmail, emailVerified: false, createdAt: timestamp, updatedAt: timestamp }, { session });
        await db.collection("account").insertOne({ _id: new ObjectId(), userId: adminId, accountId: adminId.toHexString(), providerId: "credential", password: passwordHash, createdAt: timestamp, updatedAt: timestamp }, { session });
        await db.collection("profiles").insertOne({ _id: adminId, display_name: "Demo Administrator", contact_email: plan.adminEmail, created_at: timestamp, updated_at: timestamp }, { session });
        await db.collection("user_roles").insertOne({ user_id: adminId, role: "admin", scope: plan.scope, assigned_at: timestamp, assigned_by: null }, { session });
        await db.collection("departments").insertOne({ _id: departmentId, code: "DEMO", name: "Computer Science", status: "active", created_at: timestamp, updated_at: timestamp }, { session });
        await db.collection("programs").insertOne({ _id: programId, department_id: departmentId, code: "BCA", name: "Computer Applications", status: "active", created_at: timestamp, updated_at: timestamp }, { session });
        await db.collection("audit_events").insertOne({ actor_id: adminId, action: "demo.initialized", entity_type: "programs", entity_id: programId, metadata: {}, created_at: timestamp }, { session });
      }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" }, readPreference: "primary", timeoutMS: 10_000 });
    } finally { await session.endSession(); }
    const config = `MONGODB_URI=${plan.uri}\nMONGODB_DB=${plan.database}\nAPP_ORIGIN=http://127.0.0.1:3001\nALLOW_INSECURE_LOOPBACK=true\nADMIN_SCOPE=demo\n`;
    writeFileSync(environmentFile, config, { flag: "wx", mode: 0o600 });
    console.log("Local demo setup completed. No password was printed or written to configuration. Run npm run start:demo from compliant/.");
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = demoPlan(process.argv.slice(2));
    if (!plan.execute) console.log(JSON.stringify(plan, null, 2));
    else await executeSetup(plan);
  } catch (error) {
    // Driver errors may contain documents. Print only deliberate setup errors.
    const safe = error?.constructor === Error && !error.code && !error.errorLabels;
    console.error(safe ? error.message : "Local demo setup failed. Existing resources were preserved; no automatic cleanup occurred.");
    process.exitCode = 1;
  }
}
