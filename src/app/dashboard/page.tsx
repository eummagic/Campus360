import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUserWithProfile, hasRole } from "@/lib/auth";
import { listEnrolmentsForRecord } from "@/lib/academics";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type OfferingRow = {
  id: string;
  offering: {
    id: string;
    section_code: string;
    subject: { code: string; name: string };
    term: { name: string };
  };
};

export default async function DashboardPage() {
  const { user, roles, displayName } = await requireUserWithProfile();
  const supabase = await createClient();
  const isStudent = hasRole(roles, "student");
  const isTeacher = hasRole(roles, "teacher");
  const isAdmin = hasRole(roles, "admin");

  // A teacher sees only offerings explicitly assigned to their account, even
  // when they also hold admin. Admin access is shown separately below.
  const teacherResult = isTeacher
    ? await supabase
        .from("teaching_assignments")
        .select("id, offering:course_offerings(id, section_code, subject:subjects(code, name), term:academic_terms(name))")
        .eq("teacher_user_id", user.id)
    : { data: [], error: null };
  const teacherOfferings = (teacherResult.data ?? []) as unknown as OfferingRow[];
  const offeringIds = teacherOfferings.map((row) => row.offering.id);

  const enrolmentCounts: Record<string, number> = {};
  if (offeringIds.length > 0) {
    const { data } = await supabase
      .from("enrolments")
      .select("offering_id")
      .in("offering_id", offeringIds);
    for (const row of data ?? []) {
      enrolmentCounts[row.offering_id] = (enrolmentCounts[row.offering_id] ?? 0) + 1;
    }
  }

  // Always scope the dashboard's student card to the verified user. An admin
  // with multiple student records visible through RLS must not hit maybeSingle
  // with the entire institution's dataset.
  const ownRecordResult = isStudent
    ? await supabase
        .from("student_directory")
        .select("student_record_id, registration_number, record_status, program_code, program_name, department_name")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };
  const ownRecord = ownRecordResult.data;
  const ownEnrolments = ownRecord
    ? await listEnrolmentsForRecord(ownRecord.student_record_id)
    : { rows: [], error: null };

  const adminTotals = isAdmin
    ? await Promise.all([
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("programs").select("id", { count: "exact", head: true }),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("course_offerings").select("id", { count: "exact", head: true }),
        supabase.from("student_records").select("id", { count: "exact", head: true }),
      ])
    : null;

  return (
    <AppShell roles={roles} displayName={displayName}>
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your Campus360 overview</p>
      </header>

      {isStudent ? (
        <section aria-labelledby="student-context" className="space-y-3 rounded-lg border p-4">
          <h2 id="student-context" className="text-lg font-medium">My academic record</h2>
          {ownRecord ? (
            <>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Registration</dt><dd>{ownRecord.registration_number}</dd></div>
                <div><dt className="text-muted-foreground">Program</dt><dd>{ownRecord.program_code} — {ownRecord.program_name}</dd></div>
                <div><dt className="text-muted-foreground">Department</dt><dd>{ownRecord.department_name}</dd></div>
                <div><dt className="text-muted-foreground">Status</dt><dd>{ownRecord.record_status}</dd></div>
              </dl>
              <h3 className="text-sm font-medium">Enrolments</h3>
              {ownEnrolments.error ? (
                <p role="alert" className="text-sm text-red-600">Unable to load enrolments.</p>
              ) : ownEnrolments.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No enrolments yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {ownEnrolments.rows.map((row) => {
                    const enrolment = row as unknown as {
                      id: string;
                      offering: { section_code: string; subject: { code: string; name: string; credits: number | null }; term: { name: string } };
                    };
                    return <li key={enrolment.id}>{enrolment.offering.subject.code} {enrolment.offering.subject.name} — section {enrolment.offering.section_code} — {enrolment.offering.term.name}{enrolment.offering.subject.credits != null ? ` (${enrolment.offering.subject.credits} credits)` : ""}</li>;
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Attendance, marks, and results are not available in this phase.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your student account does not have a student record yet.</p>
          )}
        </section>
      ) : null}

      {isTeacher ? (
        <section aria-labelledby="teaching-context" className="rounded-lg border p-4">
          <h2 id="teaching-context" className="text-lg font-medium">My offerings</h2>
          {teacherResult.error ? (
            <p role="alert" className="text-sm text-red-600">Unable to load teaching assignments.</p>
          ) : teacherOfferings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teaching assignments yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {teacherOfferings.map((row) => (
                <li key={row.id}>
                  <Link className="underline" href={`/directory?offering=${row.offering.id}`}>
                    {row.offering.subject.code} {row.offering.subject.name} — {row.offering.term.name} — section {row.offering.section_code}
                  </Link>
                  {` — ${enrolmentCounts[row.offering.id] ?? 0} enrolled`}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isAdmin && adminTotals ? (
        <section aria-labelledby="admin-totals" className="rounded-lg border p-4">
          <h2 id="admin-totals" className="text-lg font-medium">Structure totals</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <li>Departments: {adminTotals[0].count ?? 0}</li>
            <li>Programs: {adminTotals[1].count ?? 0}</li>
            <li>Subjects: {adminTotals[2].count ?? 0}</li>
            <li>Offerings: {adminTotals[3].count ?? 0}</li>
            <li>Student records: {adminTotals[4].count ?? 0}</li>
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
