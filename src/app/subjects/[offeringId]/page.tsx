import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { AppShell } from "@/components/app-shell";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { summarizeAttendanceCounts } from "@/lib/attendance";
import { getSubjectColorIndex } from "@/lib/subject-color";
import { formatCampusTime, getSessionDisplayKind } from "@/lib/timetable";
import { getAccess, isObjectIdString } from "@/lib/data/core";
import { canReadOffering, getOfferingDetail, listMyOfferingMarks, listOfferingFaculty, listVisibleAssignments, listVisibleSchedule, myAttendanceSummary } from "@/lib/data/campus";

export const dynamic = "force-dynamic";

type Params = { offeringId: string };
type Offering = {
  id: string;
  section_code: string;
  status: string;
  subject: { id: string; code: string; name: string; credits: number | null; program: { code: string; name: string; department: { code: string; name: string } } };
  term: { name: string; status: string; starts_on: string | null; ends_on: string | null };
};

function accentStyle(subjectCode: string) {
  const color = getSubjectColorIndex(subjectCode);
  return { "--subject-accent": `hsl(var(--subject-${color}))` } as CSSProperties;
}

function formatUtc(value: string) {
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
}

export default async function SubjectOfferingPage({ params }: { params: Promise<Params> }) {
  const { user, roles, displayName } = await requireUserWithProfile();
  const isAdmin = hasRole(roles, "admin");
  const isTeacher = hasRole(roles, "teacher");
  const isStudent = hasRole(roles, "student");
  if (!isAdmin && !isTeacher && !isStudent) redirect("/dashboard");

  const { offeringId } = await params;
  if (!isObjectIdString(offeringId)) notFound();

  const access = await getAccess(user.id);
  const studentRecordId: string | null = access.studentRecordId?.toHexString() ?? null;
  const authorized = canReadOffering(access, new ObjectId(offeringId));

  if (!authorized) notFound();

  const offeringResult = await getOfferingDetail(access, offeringId);
  if (offeringResult.error) {
    console.error("[subject-page] offering query failed", { code: offeringResult.error.code, message: offeringResult.error.message, hint: offeringResult.error.hint });
    return (
      <AppShell roles={roles} displayName={displayName}>
        <PageHeader eyebrow="Academics" title="Subject offering" description="Course details are temporarily unavailable." />
        <Callout tone="danger" role="alert">Unable to load this subject offering.</Callout>
      </AppShell>
    );
  }
  if (!offeringResult.data) notFound();
  const offering = offeringResult.data as unknown as Offering;

  const [scheduleResult, assignmentResult, facultyResult, marksResult, attendanceSummaryResult] = await Promise.all([
    listVisibleSchedule(access, { offeringIds: [offeringId] }),
    listVisibleAssignments(access, { offering_id: new ObjectId(offeringId) }, 100),
    isAdmin || isTeacher ? listOfferingFaculty(access, offeringId) : Promise.resolve({ data: [], error: null }),
    isStudent && studentRecordId ? listMyOfferingMarks(access, offeringId) : Promise.resolve({ data: [], error: null }),
    isStudent && studentRecordId ? myAttendanceSummary(access) : Promise.resolve({ data: [], error: null }),
  ]);

  const schedules = scheduleResult.data;
  const assignments = assignmentResult.data;
  const marks = marksResult.data;
  const sessionRows = marks;
  const attendanceSessions = { error: null };
  const sessionDates = new Map(marks.map((mark) => [mark.session_id, mark.session_date]));
  const summaryRows = attendanceSummaryResult.data;
  const offeringSummary = summaryRows.find((row) => row.offering_id === offeringId);
  const attendance = offeringSummary
    ? summarizeAttendanceCounts(offeringSummary.present_count, offeringSummary.absent_count, offeringSummary.late_count)
    : summarizeAttendanceCounts(0, 0, 0);
  const sessionDate = (mark: (typeof marks)[number]) => sessionDates.get(mark.session_id) ?? null;
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const sortedMarks = [...marks].sort((a, b) => (sessionDate(b) ?? "").localeCompare(sessionDate(a) ?? ""));

  return (
    <AppShell roles={roles} displayName={displayName}>
      <div className="mb-5 flex flex-wrap gap-2 text-sm text-muted-foreground"><Link href="/timetable" className="underline underline-offset-4 hover:text-foreground">Timetable</Link><span aria-hidden="true">/</span><span>{offering.subject.code}</span></div>
      <div className="mb-2 inline-flex rounded-md border border-border bg-card px-2 py-1 text-xs font-bold" style={{ ...accentStyle(offering.subject.code), color: "var(--subject-accent)" }}>{offering.subject.code}</div>
      <PageHeader eyebrow={`Section ${offering.section_code}`} title={offering.subject.name}
        description={`${offering.term.name} · ${offering.subject.program.name} · ${offering.subject.program.department.name}`}
        actions={<Link href="/assignments" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">Assignments</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Offering" className="border-t-4" style={{ ...accentStyle(offering.subject.code), borderTopColor: "var(--subject-accent)" }}>
          <p className="text-sm">Section {offering.section_code}</p><p className="mt-1 text-sm text-muted-foreground">{offering.term.status === "active" ? "Active term" : offering.term.status}</p>
        </Panel>
        <Panel title="Credits"><p className="text-sm">{offering.subject.credits === null ? "Not recorded" : offering.subject.credits}</p></Panel>
        <Panel title="Term dates"><p className="text-sm">{offering.term.starts_on ?? "Start not recorded"} – {offering.term.ends_on ?? "End not recorded"}</p></Panel>
        {isAdmin || isTeacher ? <Panel title="Assigned faculty">{facultyResult.error ? <p className="text-sm text-muted-foreground">Faculty names are unavailable.</p> : facultyResult.data?.length ? <ul className="space-y-1 text-sm">{facultyResult.data.map((faculty) => <li key={faculty.id}>{faculty.display_name}</li>)}</ul> : <p className="text-sm text-muted-foreground">No faculty assignment recorded.</p>}</Panel> : null}
      </div>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-2">
        <Panel title="Class sessions" description="Recurring times are shown in the campus local wall clock." className="xl:col-span-2">
          {scheduleResult.error ? <Callout tone="danger" role="alert">Unable to load class sessions.</Callout> : schedules.length === 0 ? <EmptyState title="No sessions scheduled" description="An administrator can add class times to this offering." /> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {schedules.map((session) => <li key={session.id} className="rounded-lg border border-border border-l-4 bg-muted/40 p-3" style={{ ...accentStyle(offering.subject.code), borderLeftColor: "var(--subject-accent)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{weekdays[session.weekday - 1] ?? "Day not available"}</p><span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{getSessionDisplayKind(offering.subject.name)}</span></div>
                <p className="mt-1 font-mono text-sm">{formatCampusTime(session.start_time)}–{formatCampusTime(session.end_time)}</p>
                {session.location ? <p className="mt-1 text-sm text-muted-foreground">{session.location}</p> : null}
              </li>)}
            </ul>
          )}
        </Panel>

        <Panel title="Assignments" description="Only assignments available under your role are shown.">
          {assignmentResult.error ? <Callout tone="danger" role="alert">Unable to load assignments.</Callout> : assignments.length ? <ul className="divide-y divide-divider">{assignments.map((assignment) => <li key={assignment.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{assignment.title}</h3><StatusBadge status={assignment.status} /></div>
            <p className="mt-1 text-sm text-muted-foreground">Due {formatUtc(assignment.due_at)}</p>
            {assignment.instructions ? <p className="mt-2 whitespace-pre-wrap text-sm">{assignment.instructions}</p> : null}
          </li>)}</ul> : <EmptyState title="No assignments available" description="Assignments will appear here when they are published or otherwise visible to your role." />}
        </Panel>

        {isStudent ? <Panel title="Your attendance" description="This section contains only your own marks for this offering.">
          {attendanceSessions.error || attendanceSummaryResult.error || marksResult.error ? <Callout tone="danger" role="alert">Unable to load your attendance for this subject.</Callout> : attendance.total === 0 ? <EmptyState title="No attendance recorded" description="Your summary and history will appear after class attendance is saved." /> : (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-success-soft p-3"><dt>Present</dt><dd className="mt-1 text-xl font-bold">{attendance.present}</dd></div>
                <div className="rounded-lg bg-danger-soft p-3"><dt>Absent</dt><dd className="mt-1 text-xl font-bold">{attendance.absent}</dd></div>
                <div className="rounded-lg bg-warning-soft p-3"><dt>Late</dt><dd className="mt-1 text-xl font-bold">{attendance.late}</dd></div>
                <div className="rounded-lg bg-muted p-3"><dt>Present share</dt><dd className="mt-1 text-xl font-bold">{attendance.percentage}%</dd></div>
              </dl>
              <h3 className="mt-5 font-semibold">Attendance history</h3>
              <ul className="mt-2 divide-y divide-divider">{sortedMarks.map((mark) => <li key={mark.id} className="flex items-center justify-between gap-3 py-2 text-sm"><time dateTime={sessionDate(mark) ?? undefined}>{sessionDate(mark) ?? "Date unavailable"}</time><StatusBadge status={mark.status} /></li>)}</ul>
              {sessionRows.length === 501 ? <Callout tone="warning" className="mt-3">The attendance history is limited to the 500 most recent scheduled sessions for this subject.</Callout> : null}
            </>
          )}
        </Panel> : null}
      </div>
    </AppShell>
  );
}
