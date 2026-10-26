import { MongoClient } from "mongodb";
import { COLLECTIONS, buildValidator } from "./schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

async function main() {
  const client = new MongoClient(requireEnv("MONGODB_ADMIN_URI"), { appName: "campus360-init" });
  try {
    await client.connect();
    const db = client.db(requireEnv("MONGODB_DB"));
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
    );
    for (const spec of COLLECTIONS) {
      const validator = buildValidator(spec);
      if (existing.has(spec.name)) {
        await db.command({ collMod: spec.name, validator, validationLevel: "strict", validationAction: "error" });
        console.log(`validator updated  ${spec.name}`);
      } else {
        await db.createCollection(spec.name, { validator, validationLevel: "strict", validationAction: "error" });
        console.log(`collection created ${spec.name}`);
      }
      if (spec.indexes.length > 0) {
        await db.collection(spec.name).createIndexes(spec.indexes);
      }
      console.log(`indexes ensured    ${spec.name} (${spec.indexes.length})`);
    }
    await db
      .collection<{ _id: string; version: number; updated_at: Date }>("locks")
      .updateOne({ _id: "timetable" }, { $setOnInsert: { version: 0, updated_at: new Date() } }, { upsert: true });
    console.log("lock ensured       locks/timetable");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
