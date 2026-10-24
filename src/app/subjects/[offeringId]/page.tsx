import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
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
import { createClient } from "@/lib/supabase/server";

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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offeringId)) notFound();

  const supabase = await createClient();
  let accessError: { code: string; message: string; hint: string } | null = null;
  let studentRecordId: string | null = null;
  let authorized = isAdmin;

  if (!authorized && isTeacher) {
    const result = await supabase.from("teaching_assignments").select("offering_id").eq("teacher_user_id", user.id).eq("offering_id", offeringId).maybeSingle();
    if (result.error) accessError = result.error;
    authorized = Boolean(result.data);
  }

  if (!authorized && isStudent) {
    const record = await supabase.from("student_records").select("id").eq("user_id", user.id).maybeSingle();
    if (record.error) accessError = record.error;
    studentRecordId = record.data?.id ?? null;
    if (studentRecordId) {
      const enrolment = await supabase.from("enrolments").select("id").eq("student_record_id", studentRecordId).eq("offering_id", offeringId).maybeSingle();
      if (enrolment.error) accessError = enrolment.error;
      authorized = Boolean(enrolment.data);
    }
  } else if (isStudent) {
    const record = await supabase.from("student_records").select("id").eq("user_id", user.id).maybeSingle();
    if (record.error) accessError = record.error;
    studentRecordId = record.data?.id ?? null;
  }

  if (accessError) {
    console.error("[subject-page] access verification failed", { code: accessError.code, message: accessError.message, hint: accessError.hint });
    return (
      <AppShell roles={roles} displayName={displayName}>
        <PageHeader eyebrow="Academics" title="Subject offering" description="Course details are temporarily unavailable." />
        <Callout tone="danger" role="alert">We could not verify access to this offering. Please try again later.</Callout>
      </AppShell>
    );
  }
  if (!authorized) notFound();

  const offeringResult = await supabase.from("course_offerings")
    .select("id, section_code, status, subject:subjects!inner(id, code, name, credits, program:programs!inner(code, name, department:departments!inner(code, name))), term:academic_terms!inner(name, status, starts_on, ends_on)")
    .eq("id", offeringId).maybeSingle();
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

  const [scheduleResult, assignmentResult, teachingResult, attendanceSessions, attendanceSummaryResult] = await Promise.all([
    supabase.from("timetable_entries").select("id, weekday, start_time, end_time, location").eq("offering_id", offeringId).order("weekday").order("start_time"),
    supabase.from("assignments").select("id, title, instructions, due_at, status").eq("offering_id", offeringId).order("due_at").limit(100),
    isAdmin || isTeacher
      ? supabase.from("teaching_assignments").select("teacher_user_id").eq("offering_id", offeringId)
      : Promise.resolve({ data: [], error: null }),
    isStudent && studentRecordId
      ? supabase.from("attendance_sessions").select("id, session_date").eq("offering_id", offeringId).order("session_date", { ascending: false }).limit(501)
      : Promise.resolve({ data: [], error: null }),
    isStudent && studentRecordId
      ? supabase.rpc("my_attendance_summary")
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [label, error] of [["schedule", scheduleResult.error], ["assignments", assignmentResult.error], ["teaching assignments", teachingResult.error], ["attendance sessions", attendanceSessions.error], ["attendance summary", attendanceSummaryResult.error]] as const) {
    if (error) console.error(`[subject-page] ${label} query failed`, { code: error.code, message: error.message, hint: error.hint });
  }

  const teachingIds = [...new Set((teachingResult.data ?? []).map((row) => row.teacher_user_id))];
  const facultyResult = (isAdmin || isTeacher) && teachingIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", teachingIds).order("display_name")
    : { data: [], error: null };
  if (facultyResult.error) console.error("[subject-page] faculty display names query failed", { code: facultyResult.error.code, message: facultyResult.error.message, hint: facultyResult.error.hint });

  const schedules = (scheduleResult.data ?? []) as Array<{ id: string; weekday: number; start_time: string; end_time: string; location: string | null }>;
  const assignments = (assignmentResult.data ?? []) as Array<{ id: string; title: string; instructions: string; due_at: string; status: "draft" | "published" }>;
  const sessionRows = (attendanceSessions.data ?? []) as Array<{ id: string; session_date: string }>;
  const sessionDates = new Map(sessionRows.map((session) => [session.id, session.session_date]));
  const marksResult = isStudent && studentRecordId && sessionRows.length
    ? await supabase.from("attendance_records").select("id, session_id, status").eq("student_record_id", studentRecordId).eq("offering_id", offeringId).in("session_id", sessionRows.map((session) => session.id))
    : { data: [], error: null };
  if (marksResult.error) console.error("[subject-page] own attendance marks query failed", { code: marksResult.error.code, message: marksResult.error.message, hint: marksResult.error.hint });
  if (attendanceSessions.error) console.error("[subject-page] attendance sessions query failed", { code: attendanceSessions.error.code, message: attendanceSessions.error.message, hint: attendanceSessions.error.hint });
  if (attendanceSummaryResult.error) console.error("[subject-page] own attendance summary query failed", { code: attendanceSummaryResult.error.code, message: attendanceSummaryResult.error.message, hint: attendanceSummaryResult.error.hint });
  const marks = (marksResult.data ?? []) as Array<{ id: string; session_id: string; status: "present" | "absent" | "late" }>;
  const summaryRows = (attendanceSummaryResult.data ?? []) as Array<{ offering_id: string; present_count: number; absent_count: number; late_count: number }>;
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
