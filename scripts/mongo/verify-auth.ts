import { getDb, getMongoClient } from "../../src/lib/mongo/connection";
import { LEGACY_USERS } from "./seed-auth-users";

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const jsonHeaders = { "Content-Type": "application/json", Origin: BASE };
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  try {
    const good = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ email: "student1@example.com", password: "password123" }),
    });
    const setCookies = good.headers.getSetCookie();
    check("student1 signs in with password123", good.status === 200, `status ${good.status}`);
    check("session cookie issued", setCookies.some((c) => c.includes("session_token")));
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

    const sessionRes = await fetch(`${BASE}/api/auth/get-session`, { headers: { Cookie: cookie, Origin: BASE } });
    const session = (await sessionRes.json()) as { user?: { email?: string } } | null;
    check("get-session returns student1", session?.user?.email === "student1@example.com");

    const bad = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ email: "student1@example.com", password: "wrong-password-1" }),
    });
    check("wrong password is rejected", bad.status >= 400, `status ${bad.status}`);

    const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ email: "intruder@example.com", password: "password123", name: "Intruder" }),
    });
    check("public sign-up is blocked", signUp.status >= 400, `status ${signUp.status}`);

    const db = getDb();
    const emails = LEGACY_USERS.map((u) => u.email);
    check("intruder account was not created", (await db.collection("user").countDocuments({ email: "intruder@example.com" })) === 0);
    check("8 demo users exist", (await db.collection("user").countDocuments({ email: { $in: emails } })) === 8);
    check("8 profiles exist", (await db.collection("profiles").countDocuments({ contact_email: { $in: emails } })) === 8);
    const accounts = await db.collection("account").find({ providerId: "credential" }).toArray();
    check("passwords stored hashed, never plain text", accounts.length >= 8 && accounts.every((a) => typeof a.password === "string" && a.password !== "password123" && a.password.length > 20));
    const multi = await db.collection("user").findOne({ email: "adminstudent1@example.com" });
    check("adminstudent1 has admin + student roles", multi !== null && (await db.collection("user_roles").countDocuments({ user_id: multi._id })) === 2);
  } finally {
    await getMongoClient().close();
  }
  console.log(failures === 0 ? "\nALL AUTH CHECKS PASSED" : `\n${failures} AUTH CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
