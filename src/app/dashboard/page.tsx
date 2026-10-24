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

  const quickActions = [
    ...(ownRecord ? [{ href: `/directory/${ownRecord.student_record_id}`, label: "View my academic record", detail: "Review your program and enrolments." }] : []),
    ...((isTeacher || isAdmin) ? [{ href: "/directory", label: "Student directory", detail: "Search students within your authorized scope." }] : []),
    ...(isAdmin ? [
      { href: "/admin/academics", label: "Academic structure", detail: "Review departments, programs, and offerings." },
      { href: "/admin/students/new", label: "Create student record", detail: "Link an existing account to an academic record." },
    ] : []),
    { href: "/profile", label: "Profile settings", detail: "Update your display name and account details." },
  ];

  return (
    <AppShell roles={roles} displayName={displayName}>
      <header className="w-full rounded-2xl bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5 ring-1 ring-border sm:px-7">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Campus360 overview</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Welcome, {displayName}</h1>
        <p className="mt-2 text-muted-foreground">Your academic information and tools in one place.</p>
      </header>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      {isStudent ? (
        <section aria-labelledby="student-context" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <h2 id="student-context" className="text-lg font-semibold">My academic record</h2>
          {ownRecord ? (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registration</dt><dd className="mt-1 font-medium">{ownRecord.registration_number}</dd></div>
                <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Program</dt><dd className="mt-1 font-medium">{ownRecord.program_code} — {ownRecord.program_name}</dd></div>
                <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</dt><dd className="mt-1 font-medium">{ownRecord.department_name}</dd></div>
                <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-1 font-medium capitalize">{ownRecord.record_status}</dd></div>
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
        <section aria-labelledby="teaching-context" className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 id="teaching-context" className="text-lg font-semibold">My offerings</h2>
          {teacherResult.error ? (
            <p role="alert" className="text-sm text-red-600">Unable to load teaching assignments.</p>
          ) : teacherOfferings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teaching assignments yet.</p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {teacherOfferings.map((row) => (
                <li key={row.id} className="rounded-lg border p-4 transition-shadow hover:shadow-sm">
                  <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/directory?offering=${row.offering.id}`}>
                    {row.offering.subject.code} {row.offering.subject.name} — {row.offering.term.name} — section {row.offering.section_code}
                  </Link>
                  <p className="mt-2 text-sm text-muted-foreground">{enrolmentCounts[row.offering.id] ?? 0} students enrolled</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isAdmin && adminTotals ? (
        <section aria-labelledby="admin-totals" className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
          <h2 id="admin-totals" className="text-lg font-semibold">Structure totals</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[["Departments", adminTotals[0].count], ["Programs", adminTotals[1].count], ["Subjects", adminTotals[2].count], ["Offerings", adminTotals[3].count], ["Student records", adminTotals[4].count]].map(([label, count]) => <li key={label} className="rounded-lg bg-muted/50 p-4"><span className="block text-2xl font-bold tabular-nums">{count ?? 0}</span><span className="mt-1 block text-sm text-muted-foreground">{label}</span></li>)}
          </ul>
        </section>
      ) : null}
      </div>

      <section aria-labelledby="quick-actions" className="w-full rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 id="quick-actions" className="text-lg font-semibold">Quick actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Shortcuts to the tools available to your account.</p>
        </div>
        <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <li key={action.href}>
              <Link href={action.href} className="group flex h-full min-w-0 items-start justify-between gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{action.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{action.detail}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-primary transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
