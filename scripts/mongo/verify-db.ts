import { MongoClient, MongoServerError, ObjectId, type CollectionInfo, type Db, type Document } from "mongodb";
import { COLLECTIONS } from "./schema";

let failures = 0;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function hasCode(error: unknown, code: number): boolean {
  return error instanceof MongoServerError && error.code === code;
}

function timetableEntry(overrides: Document = {}): Document {
  return {
    offering_id: new ObjectId(),
    term_id: new ObjectId(),
    weekday: 2,
    start_minute: 540,
    end_minute: 600,
    location: null,
    location_key: null,
    created_by: new ObjectId(),
    updated_by: new ObjectId(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

async function expectRejected(db: Db, name: string, doc: Document, code: number, label: string) {
  try {
    const result = await db.collection(name).insertOne(doc);
    await db.collection(name).deleteOne({ _id: result.insertedId });
    check(label, false, "insert was accepted (test row removed)");
  } catch (error) {
    check(label, hasCode(error, code), hasCode(error, code) ? "" : String(error));
  }
}

async function main() {
  const client = new MongoClient(requireEnv("MONGODB_ADMIN_URI"), { appName: "campus360-verify" });
  try {
    await client.connect();
    const db = client.db(requireEnv("MONGODB_DB"));
    const infos = (await db.listCollections().toArray()) as CollectionInfo[];

    for (const spec of COLLECTIONS) {
      const info = infos.find((c) => c.name === spec.name);
      check(`collection ${spec.name} has validator`, Boolean(info?.options?.validator));
      if (!info) continue;
      const actual = await db.collection(spec.name).indexes();
      for (const expected of spec.indexes) {
        const found = actual.find((i) => i.name === expected.name);
        check(
          `index ${spec.name}.${expected.name}`,
          Boolean(found) && Boolean(found?.unique) === Boolean(expected.unique),
        );
      }
    }

    const lock = await db.collection<{ _id: string }>("locks").findOne({ _id: "timetable" });
    check("lock document locks/timetable exists", lock !== null);

    await expectRejected(db, "timetable_entries", timetableEntry({ weekday: 9 }), 121, "validator rejects weekday 9");
    await expectRejected(
      db,
      "timetable_entries",
      timetableEntry({ start_minute: 600, end_minute: 540 }),
      121,
      "validator rejects end_minute <= start_minute",
    );
    await expectRejected(
      db,
      "departments",
      { code: "ZZX", name: "x", status: "active", created_at: new Date(), updated_at: new Date(), extra: 1 },
      121,
      "validator rejects unknown fields",
    );

    const session = client.startSession();
    try {
      session.startTransaction();
      const make = () => ({ code: "ZZVERIFY", name: "Verification only", status: "active", created_at: new Date(), updated_at: new Date() });
      await db.collection("departments").insertOne(make(), { session });
      let duplicateRejected = false;
      try {
        await db.collection("departments").insertOne(make(), { session });
      } catch (error) {
        duplicateRejected = hasCode(error, 11000);
      }
      check("unique index rejects duplicate department code (inside transaction)", duplicateRejected);
    } finally {
      await session.abortTransaction().catch(() => undefined);
      await session.endSession();
    }
    check(
      "aborted transaction left no ZZVERIFY rows",
      (await db.collection("departments").countDocuments({ code: "ZZVERIFY" })) === 0,
    );
  } finally {
    await client.close();
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
