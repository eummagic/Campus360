import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUserWithProfile, hasRole, isStaff } from "@/lib/auth";
import { buildDirectoryRows, listEnrolmentsForRecord, listUnlinkedStudentUsers, listVisibleTeachingAssignments } from "@/lib/academics";
import { getAccess } from "@/lib/data/core";
import { adminCounts, countEnrolmentsByOffering, listActiveTerms } from "@/lib/data/campus";

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

type StudentEnrolment = {
  id: string;
  offering: {
    section_code: string;
    subject: { code: string; name: string; credits: number | null };
    term: { name: string };
  };
};

const roleNames = {
  admin: "Administrator",
  student: "Student",
  teacher: "Teacher",
  driver: "Driver",
  finance: "Finance",
} as const;

function formatDate(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function MetricLink({ href, label, value, detail }: { href: string; label: string; value: number | null; detail?: string }) {
  return (
    <Link href={href} className="block min-h-20 px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-text">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <span className="mt-1 block text-2xl font-bold tabular-nums">{value ?? "—"}<span aria-hidden="true" className="ml-2 text-sm text-primary-text">→</span></span>
      {detail ? <span className="mt-1 block text-xs text-muted-foreground">{detail}</span> : null}
    </Link>
  );
}

export default async function DashboardPage() {
  const { user, roles, displayName } = await requireUserWithProfile();
  const access = await getAccess(user.id);
  const isStudent = hasRole(roles, "student");
  const isTeacher = hasRole(roles, "teacher");
  const isAdmin = hasRole(roles, "admin");
  const visibleRoles = [...new Set(roles.map(({ role }) => roleNames[role]))];

  const [termResult, teacherResult, ownRecordResult] = await Promise.all([
    listActiveTerms(),
    isTeacher ? listVisibleTeachingAssignments(access, true) : Promise.resolve({ data: [], error: null }),
    isStudent && access.studentRecordId
      ? buildDirectoryRows({ _id: access.studentRecordId }, 1)
          .then((rows) => ({ data: rows[0] ?? null, error: null }))
          .catch(() => ({ data: null, error: { code: "DB_ERROR", message: "Unable to load record", hint: "" } }))
      : Promise.resolve({ data: null, error: null }),
  ]);

  const teacherOfferings = (teacherResult.data ?? []) as unknown as OfferingRow[];
  const offeringIds = teacherOfferings.map((row) => row.offering.id);
  const teacherEnrolmentsResult = offeringIds.length
    ? await countEnrolmentsByOffering(offeringIds)
    : { data: {} as Record<string, number>, error: null };
  const enrolmentCounts: Record<string, number> = teacherEnrolmentsResult.data;
  const totalTeacherEnrolments = Object.values(enrolmentCounts).reduce((total, count) => total + count, 0);

  const ownRecord = ownRecordResult.data;
  const ownEnrolmentsResult = ownRecord
    ? await listEnrolmentsForRecord(access, ownRecord.student_record_id)
    : { rows: [], error: null };
  const ownEnrolments = ownEnrolmentsResult.rows as unknown as StudentEnrolment[];
  const recordedCredits = ownEnrolments.reduce((total, enrolment) => total + (enrolment.offering.subject.credits ?? 0), 0);
  const creditCount = ownEnrolments.filter((enrolment) => enrolment.offering.subject.credits != null).length;

  const countsResult = isAdmin ? await adminCounts(access) : null;
  const counts = countsResult?.data ?? null;
  const adminTotals = isAdmin
    ? [
        counts?.departments, counts?.programs, counts?.subjects, counts?.offerings, counts?.teaching,
        counts?.records, counts?.active, counts?.inactive, counts?.graduated,
      ].map((count) => ({ count: count ?? null, error: countsResult?.error ?? null }))
    : null;
  const candidatesResult = isAdmin ? await listUnlinkedStudentUsers(access) : null;

  const activeTerms = termResult.data ?? [];
  const termLabel = termResult.error
    ? "Term information unavailable"
    : activeTerms.length === 0
      ? "No active term"
      : activeTerms.length === 1
        ? activeTerms[0].name
        : `${activeTerms.length} active terms`;
  const activeTerm = activeTerms.length === 1 ? activeTerms[0] : null;
  const startDate = formatDate(activeTerm?.starts_on ?? null);
  const endDate = formatDate(activeTerm?.ends_on ?? null);
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : startDate ?? endDate;

  const adminMetricItems = adminTotals
    ? [
        { label: "Student records", count: adminTotals[5].count, href: "/directory" },
        { label: "Departments", count: adminTotals[0].count, href: "/admin/academics" },
        { label: "Programs", count: adminTotals[1].count, href: "/admin/academics" },
        { label: "Subjects", count: adminTotals[2].count, href: "/admin/academics" },
        { label: "Offerings", count: adminTotals[3].count, href: "/admin/academics" },
        { label: "Teaching assignments", count: adminTotals[4].count, href: "/admin/academics" },
      ]
    : [];
  const adminCountError = adminTotals?.some((result) => result.error) ?? false;
  const adminStatusCounts = adminTotals?.slice(6) ?? [];
  const adminCandidateCount = candidatesResult?.data?.length ?? 0;
  const adminCandidateError = candidatesResult?.error ?? null;
  const showStudentSearch = isAdmin || (isTeacher && teacherOfferings.length > 0);
  const quickActions = [
    ...(ownRecord ? [{ href: `/directory/${ownRecord.student_record_id}`, label: "My academic record", detail: "Review your program and enrolled offerings." }] : []),
    ...(isStaff(roles) ? [{ href: "/directory", label: "Student directory", detail: "Open students within your authorized scope." }] : []),
    ...((isStudent || isTeacher || isAdmin) ? [
      { href: "/timetable", label: "Class timetable", detail: "View scheduled classes for your offerings." },
      { href: "/attendance", label: "Attendance", detail: "View history or record marks for an assigned class." },
      { href: "/assignments", label: "Assignments", detail: isStudent ? "See published work for enrolled offerings." : "View or manage assignments in your authorized scope." },
      { href: "/calendar", label: "Academic calendar", detail: "See class times and published deadlines." },
    ] : []),
    ...(isAdmin ? [
      { href: "/admin/academics", label: "Academic structure", detail: "Review departments, programs, and offerings." },
      { href: "/admin/students/new", label: "Create student record", detail: "Link an existing student account." },
    ] : []),
    { href: "/profile", label: "Profile settings", detail: "Update your display name and account details." },
  ];

  return (
    <AppShell roles={roles} displayName={displayName}>
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome, ${displayName}`}
        description={visibleRoles.join(" · ") || "Your Campus360 workspace"}
        actions={(
          <div role="group" aria-label="Current academic term" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current term</span>
            <span className="font-semibold">{termLabel}</span>
            {activeTerm ? <StatusBadge status="active" /> : null}
            {dateRange ? <span className="text-muted-foreground">{dateRange}</span> : null}
          </div>
        )}
      />

      <Panel title="Quick actions">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <li key={action.href}>
              <Link href={action.href} className="flex min-h-11 h-full flex-col justify-center rounded-lg border border-border px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">
                <span className="text-sm font-semibold text-primary-text">{action.label}</span>
                <span className="mt-1 text-xs text-muted-foreground">{action.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {isStudent ? (
        <Panel title="My academic record" description="Your linked academic record and enrolled offerings." className="space-y-4">
          {ownRecordResult.error ? <Callout tone="danger" role="alert">Unable to load your academic record.</Callout> : ownRecord ? (
            <>
              <dl className="grid divide-y divide-divider text-sm sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
                <div className="border-divider py-3 sm:border-b sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registration</dt><dd className="mt-1 font-mono font-medium">{ownRecord.registration_number}</dd></div>
                <div className="border-divider py-3 sm:border-b sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Program</dt><dd className="mt-1 font-medium">{ownRecord.program_code} — {ownRecord.program_name}</dd></div>
                <div className="border-divider py-3 sm:border-b sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</dt><dd className="mt-1 font-medium">{ownRecord.department_name}</dd></div>
                <div className="border-divider py-3 sm:border-b sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={ownRecord.record_status} /></dd></div>
              </dl>
              {ownEnrolmentsResult.error ? <Callout tone="danger" role="alert">Unable to load your enrolments.</Callout> : (
                <>
                <Link href={`/directory/${ownRecord.student_record_id}`} className="flex flex-wrap gap-x-6 gap-y-2 border-t border-divider py-3 text-sm text-primary-text underline-offset-4 hover:underline">
                  <span>{ownEnrolments.length} enrolments</span>
                  <span>{recordedCredits} recorded credits{creditCount < ownEnrolments.length ? ` for ${creditCount} of ${ownEnrolments.length} enrolments` : ""}</span>
                  <span aria-hidden="true">View full record →</span>
                </Link>
                {ownEnrolments.length === 0 ? <p className="text-sm text-muted-foreground">No offerings are linked to your academic record.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-left text-sm">
                    <caption className="sr-only">My enrolled offerings and recorded credits</caption>
                    <thead className="border-b border-divider text-xs uppercase tracking-wide text-muted-foreground"><tr>
                      <th scope="col" className="px-3 py-2">Code</th><th scope="col" className="px-3 py-2">Subject</th><th scope="col" className="px-3 py-2">Section</th><th scope="col" className="px-3 py-2">Term</th><th scope="col" className="px-3 py-2">Credits</th>
                    </tr></thead>
                    <tbody className="divide-y divide-divider">{ownEnrolments.map((enrolment) => (
                      <tr key={enrolment.id}>
                        <td className="whitespace-nowrap px-3 py-3 font-mono">{enrolment.offering.subject.code}</td><td className="px-3 py-3">{enrolment.offering.subject.name}</td><td className="px-3 py-3">{enrolment.offering.section_code}</td><td className="px-3 py-3">{enrolment.offering.term.name}</td><td className="px-3 py-3">{enrolment.offering.subject.credits ?? "Not recorded"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                )}
                </>
              )}
              <p className="text-xs text-muted-foreground">Attendance, marks, and results are not available in this phase.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your account isn&apos;t linked to a student record yet. An administrator links accounts to records, so there&apos;s nothing you need to do.</p>
          )}
        </Panel>
      ) : null}

      {isTeacher ? (
        <Panel
          title="My offerings"
          description="Assignments scoped to your account."
          actions={!teacherResult.error && !teacherEnrolmentsResult.error ? (
            <div className="flex gap-4 text-sm">
              <Link href="/directory" className="font-medium text-primary-text underline-offset-4 hover:underline">{teacherOfferings.length} offerings</Link>
              <Link href="/directory" className="font-medium text-primary-text underline-offset-4 hover:underline">{totalTeacherEnrolments} enrolments</Link>
            </div>
          ) : undefined}
        >
          {teacherResult.error || teacherEnrolmentsResult.error ? <Callout tone="danger" role="alert">Unable to load your teaching assignments.</Callout> : teacherOfferings.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no teaching assignments yet. An administrator assigns offerings; they will appear here.</p>
          ) : (
            <ul className="divide-y divide-divider">
              {teacherOfferings.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p><span className="font-mono font-semibold">{row.offering.subject.code}</span> <span className="font-medium">{row.offering.subject.name}</span></p>
                    <p className="mt-1 text-sm text-muted-foreground">Section {row.offering.section_code} · {row.offering.term.name} · {enrolmentCounts[row.offering.id] ?? 0} enrolments</p>
                  </div>
                  <Link href={`/directory?offering=${encodeURIComponent(row.offering.id)}`} className="shrink-0 text-sm font-medium text-primary-text underline-offset-4 hover:underline">Open roster →</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {isAdmin ? (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <Panel title="Academic overview" className="xl:col-start-1 xl:row-start-1">
            {adminCountError ? <Callout tone="danger" role="alert" className="mb-4">Some academic totals could not be loaded.</Callout> : null}
            <ul className="grid grid-cols-2 divide-x divide-y divide-divider sm:grid-cols-3">
              {adminMetricItems.map((metric) => (
                <li key={metric.label}><MetricLink href={metric.href} label={metric.label} value={metric.count} /></li>
              ))}
            </ul>
            <div className="mt-4 border-t border-divider pt-4">
              <h3 className="text-sm font-semibold">Student records by status</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                {(["Active", "Inactive", "Graduated"] as const).map((label, index) => (
                  <li key={label}>
                    <MetricLink href={`/directory?status=${label.toLowerCase()}`} label={label} value={adminStatusCounts[index]?.count ?? null} />
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Tasks" className="xl:col-start-2 xl:row-start-1">
            {adminCandidateError ? <Callout tone="danger" role="alert" className="mb-3">The unlinked student account count is unavailable.</Callout> : adminCandidateCount > 0 ? (
              <Callout tone="warning" className="mb-3">
                <span>{adminCandidateCount} student {adminCandidateCount === 1 ? "account has" : "accounts have"} no record.</span>{" "}
                <Link href="/admin/students/new" className="font-semibold underline underline-offset-4">Create student record →</Link>
              </Callout>
            ) : (
              <Callout tone="success" role="status" className="mb-3">All student accounts are linked.</Callout>
            )}
            {showStudentSearch ? (
              <form action="/directory" method="get" className="space-y-2">
                <label htmlFor="dashboard-student-search" className="text-sm font-medium">Find a student</label>
                <div className="flex gap-2">
                  <input id="dashboard-student-search" name="q" maxLength={120} placeholder="Name or registration number" className="min-h-11 min-w-0 flex-1 rounded-lg border border-input-border px-3 text-sm" />
                  <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">Search</button>
                </div>
              </form>
            ) : null}
          </Panel>
        </div>
      ) : isTeacher && teacherOfferings.length > 0 ? (
        <Panel title="Tasks">
          <form action="/directory" method="get" className="space-y-2">
            <label htmlFor="dashboard-student-search" className="text-sm font-medium">Find a student</label>
            <div className="flex gap-2">
              <input id="dashboard-student-search" name="q" maxLength={120} placeholder="Name or registration number" className="min-h-11 min-w-0 flex-1 rounded-lg border border-input-border px-3 text-sm" />
              <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">Search</button>
            </div>
          </form>
        </Panel>
      ) : null}
    </AppShell>
  );
}
