import { ObjectId } from "mongodb";
import { createAuth } from "../../src/lib/auth/config";
import { getDb, getMongoClient } from "../../src/lib/mongo/connection";

type DemoRole = "student" | "teacher" | "admin";
export type SeedAuthUser = { email: string; password: string; displayName: string; roles: Array<{ role: DemoRole; scope: string }> };

// Exact copy of the 8 users in scripts/seed-users.ts (Sidharth's original demo accounts).
export const LEGACY_USERS: SeedAuthUser[] = [
  { email: "admin1@example.com", password: "password123", displayName: "Admin One", roles: [{ role: "admin", scope: "demo" }] },
  { email: "student1@example.com", password: "password123", displayName: "Student One", roles: [{ role: "student", scope: "demo" }] },
  { email: "student2@example.com", password: "password123", displayName: "Student Two", roles: [{ role: "student", scope: "demo" }] },
  { email: "student3@example.com", password: "password123", displayName: "Student Three (unlinked)", roles: [{ role: "student", scope: "demo" }] },
  { email: "student4@example.com", password: "password123", displayName: "Student Four (unlinked test)", roles: [{ role: "student", scope: "demo" }] },
  { email: "adminstudent1@example.com", password: "password123", displayName: "Admin Student (multi-role)", roles: [{ role: "admin", scope: "demo" }, { role: "student", scope: "demo" }] },
  { email: "teacher1@example.com", password: "password123", displayName: "Teacher One", roles: [{ role: "teacher", scope: "demo" }] },
  { email: "teacher2@example.com", password: "password123", displayName: "Teacher Two (unassigned)", roles: [{ role: "teacher", scope: "demo" }] },
];

const auth = createAuth();

// Idempotent: existing users are reused; passwords of existing users are NEVER changed.
export async function ensureAuthUsers(users: SeedAuthUser[]): Promise<Map<string, ObjectId>> {
  const ctx = await auth.$context;
  const db = getDb();
  const ids = new Map<string, ObjectId>();
  for (const user of users) {
    const email = user.email.toLowerCase();
    const existing = await ctx.internalAdapter.findUserByEmail(email);
    let userId: string;
    if (existing?.user) {
      userId = existing.user.id;
    } else {
      const created = await ctx.internalAdapter.createUser(
        { email, name: user.displayName, emailVerified: true },
        { method: "email-password" },
      );
      const hash = await ctx.password.hash(user.password);
      await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: hash });
      userId = created.id;
    }
    const oid = new ObjectId(userId);
    const now = new Date();
    await db.collection("profiles").updateOne(
      { _id: oid },
      { $setOnInsert: { display_name: user.displayName, contact_email: email, created_at: now, updated_at: now } },
      { upsert: true },
    );
    for (const role of user.roles) {
      await db.collection("user_roles").updateOne(
        { user_id: oid, role: role.role, scope: role.scope },
        { $setOnInsert: { user_id: oid, role: role.role, scope: role.scope, assigned_at: now, assigned_by: null } },
        { upsert: true },
      );
    }
    ids.set(email, oid);
    console.log(`${existing?.user ? "exists " : "created"}  ${email}`);
  }
  return ids;
}

async function main() {
  try {
    await ensureAuthUsers(LEGACY_USERS);
  } finally {
    await getMongoClient().close();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/mongo/seed-auth-users.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
