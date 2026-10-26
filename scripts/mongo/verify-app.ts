// End-to-end data + permission check against the running app (pnpm dev).
// Replaces the old Supabase RLS tests: signs in as different demo users and
// checks that each one sees only the rows the security matrix allows.
// Usage: start `pnpm dev`, then run `pnpm db:mongo:verify-app`.
import { getDb, getMongoClient } from "../../src/lib/mongo/connection";

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const SYNTHETIC_PASSWORD = process.env.CAMPUS360_SYNTHETIC_TEST_PASSWORD || "password123";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function page(cookie: string, path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: "manual" });
  return { status: res.status, html: res.status === 200 ? await res.text() : "" };
}

async function main() {
  const db = getDb();
  try {
    // ---- Seeded data volumes -------------------------------------------------
    const students = await db.collection("student_records").countDocuments();
    check("123 student records (3 original + 120 synthetic)", students === 123, `found ${students}`);
    const offerings = await db.collection("course_offerings").countDocuments();
    check("26 course offerings (2 section A + 24 S5)", offerings === 26, `found ${offerings}`);
    const entries = await db.collection("timetable_entries").countDocuments();
    check("74 timetable entries (2 + 72)", entries === 74, `found ${entries}`);
    check("attendance marks exist", (await db.collection("attendance_records").countDocuments()) > 1000);
    check("assignments exist (4 original + 72 synthetic)", (await db.collection("assignments").countDocuments()) === 76);

    const student2 = await db.collection("student_records").findOne({ registration_number: "CSE2023002" });
    const s5a001 = await db.collection("student_records").findOne({ registration_number: "DEMO-S5-A-001" });

    // ---- Student: own data only ---------------------------------------------
    const student = await signIn("student1@example.com", "password123");
    check("student1 can sign in", student !== null);
    if (student) {
      const dash = await page(student, "/dashboard");
      check("student1 dashboard shows own registration", dash.status === 200 && dash.html.includes("CSE2023001"), `status ${dash.status}`);
      check("student1 dashboard does not show student2", !dash.html.includes("CSE2023002"));
      const other = await page(student, `/directory/${student2?._id.toHexString()}`);
      check("student1 cannot open student2's record", other.status !== 200 || !other.html.includes("CSE2023002"), `status ${other.status}`);
      const dir = await page(student, "/directory");
      check("student1 is kept out of the staff directory", dir.status !== 200 || !dir.html.includes("CSE2023002"), `status ${dir.status}`);
      const att = await page(student, "/attendance");
      check("student1 attendance page loads", att.status === 200 && !att.html.includes("Unable to load your attendance"), `status ${att.status}`);
    }

    // ---- Assigned teacher: own offerings' students only ----------------------
    const teacher = await signIn("teacher1@example.com", "password123");
    check("teacher1 can sign in", teacher !== null);
    if (teacher) {
      const dir = await page(teacher, "/directory");
      check("teacher1 sees students of own offerings", dir.status === 200 && dir.html.includes("CSE2023001") && dir.html.includes("CSE2023002"), `status ${dir.status}`);
      check("teacher1 does not see other sections' students", !dir.html.includes("DEMO-S5-A-001"));
      const att = await page(teacher, "/attendance");
      check("teacher1 attendance page loads", att.status === 200 && !att.html.includes("Unable to load"), `status ${att.status}`);
      const other = await page(teacher, `/directory/${s5a001?._id.toHexString()}`);
      check("teacher1 cannot open an S5 student's record", other.status !== 200 || !other.html.includes("DEMO-S5-A-001"), `status ${other.status}`);
    }

    // ---- Unassigned teacher: nothing -----------------------------------------
    const teacher2 = await signIn("teacher2@example.com", "password123");
    if (teacher2) {
      const dir = await page(teacher2, "/directory");
      check("teacher2 (unassigned) sees no students", !dir.html.includes("CSE2023001") && !dir.html.includes("DEMO-S5-A-001"), `status ${dir.status}`);
    } else check("teacher2 can sign in", false);

    // ---- Admin: everything ---------------------------------------------------
    const admin = await signIn("admin1@example.com", "password123");
    check("admin1 can sign in", admin !== null);
    if (admin) {
      const dash = await page(admin, "/dashboard");
      check("admin dashboard totals load", dash.status === 200 && !dash.html.includes("Some academic totals could not be loaded"), `status ${dash.status}`);
      const dir = await page(admin, "/directory?q=DEMO-S5-D-030");
      check("admin can find any student", dir.status === 200 && dir.html.includes("DEMO-S5-D-030"), `status ${dir.status}`);
      for (const path of ["/timetable", "/assignments", "/calendar", "/admin/academics", "/admin/students/new", "/profile"]) {
        const res = await page(admin, path);
        check(`admin ${path} loads`, res.status === 200 && !/Unable to load/i.test(res.html), `status ${res.status}`);
      }
    }

    // ---- Synthetic S5 accounts -----------------------------------------------
    const s5 = await signIn("campus360-demo-s5-a-001@example.test", SYNTHETIC_PASSWORD);
    check("synthetic S5 student can sign in", s5 !== null);
    if (s5) {
      const tt = await page(s5, "/timetable");
      check("S5 student timetable shows S5-A classes", tt.status === 200 && tt.html.includes("S5-A"), `status ${tt.status}`);
      check("S5 student timetable hides other sections", !tt.html.includes("S5-B"));
    }
    const s5t = await signIn("campus360-demo-s5-teacher-a@example.test", SYNTHETIC_PASSWORD);
    check("synthetic S5 teacher can sign in", s5t !== null);
  } finally {
    await getMongoClient().close();
  }
  console.log(failures === 0 ? "\nALL APP CHECKS PASSED" : `\n${failures} APP CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
