import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { summarizeAttendanceCounts, type AttendanceStatus } from "@/lib/attendance";
import { AttendanceForm } from "./attendance-form";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type OfferingRow = { id: string; section_code: string; subject: { code: string; name: string }; term: { name: string } };
type ScheduleRow = { id: string; weekday: number; start_time: string; end_time: string; offering: OfferingRow };
type AttendanceSummary = { offering_id: string; subject_code: string; subject_name: string; section_code: string; recorded_sessions: number; recorded_marks?: number; present_count: number; absent_count: number; late_count: number };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, roles, displayName } = await requireUserWithProfile();
  if (!roles.some(({ role }) => role === "admin" || role === "teacher" || role === "student")) redirect("/dashboard");
  const isStudent = hasRole(roles, "student");
  const isTeacher = hasRole(roles, "teacher");
  const isAdmin = hasRole(roles, "admin");
  const query = await searchParams;
  const entryId = typeof query.entry === "string" ? query.entry : "";
  const requestedReportOffering = typeof query.offering === "string" ? query.offering : "";
  const historyPage = typeof query.page === "string" && /^[1-9]\d*$/.test(query.page) ? Math.min(Number(query.page), 10000) : 1;
  const historyPageSize = 50;
  const rawDate = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const [studentRecordResult, scheduleResult, summaryResult] = await Promise.all([
    isStudent ? supabase.from("student_records").select("id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    isTeacher ? supabase.from("timetable_entries").select("id, weekday, start_time, end_time, offering:course_offerings(id, section_code, subject:subjects(code, name), term:academic_terms(name))").order("weekday").order("start_time").limit(200) : Promise.resolve({ data: [], error: null }),
    isTeacher || isAdmin ? supabase.rpc("scoped_attendance_summary") : Promise.resolve({ data: [], error: null }),
  ]);
  if (scheduleResult.error) {
    console.error("[attendance] assigned timetable query failed", {
      code: scheduleResult.error.code,
      message: scheduleResult.error.message,
      hint: scheduleResult.error.hint,
    });
  }
  if (summaryResult.error) {
    console.error("[attendance] scoped summary query failed", {
      code: summaryResult.error.code,
      message: summaryResult.error.message,
      hint: summaryResult.error.hint,
    });
  }
  const studentRecordId = studentRecordResult.data?.id ?? null;
  const [studentSummaryResult, studentHistoryResult] = isStudent && studentRecordId
    ? await Promise.all([
        supabase.rpc("my_attendance_summary"),
        supabase.rpc("my_attendance_history", { p_limit: historyPageSize, p_offset: (historyPage - 1) * historyPageSize }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const schedules = (scheduleResult.data ?? []) as unknown as ScheduleRow[];
  const reportOfferingId = isTeacher && schedules.some((entry) => entry.offering.id === requestedReportOffering) ? requestedReportOffering : "";
  const studentReportResult = reportOfferingId
    ? await supabase.rpc("offering_attendance_by_student", { p_offering_id: reportOfferingId })
    : { data: [], error: null };
  const studentReportRows = (studentReportResult.data ?? []) as unknown as Array<{ student_record_id: string; registration_number: string; display_name: string; recorded_sessions: number; present_count: number; absent_count: number; late_count: number }>;
  const selectedSchedule = isTeacher ? schedules.find((entry) => entry.id === entryId) : undefined;
  const selectedDateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && Number.isFinite(Date.parse(`${rawDate}T00:00:00Z`));
  const selectedWeekday = selectedDateIsValid ? new Date(`${rawDate}T00:00:00Z`).getUTCDay() || 7 : 0;
  const selectedDayMatches = selectedSchedule?.weekday === selectedWeekday;
  let roster: Array<{ studentRecordId: string; registrationNumber: string; displayName: string; status: "present" | "absent" | "late" | "" }> = [];
  let sessionError: string | null = null;
  if (selectedSchedule && selectedDayMatches) {
    const [enrolmentResult, sessionResult] = await Promise.all([
      supabase.from("enrolments").select("student_record_id").eq("offering_id", selectedSchedule.offering.id).limit(201),
      supabase.from("attendance_sessions").select("id").eq("timetable_entry_id", selectedSchedule.id).eq("session_date", rawDate).maybeSingle(),
    ]);
    if (enrolmentResult.error || sessionResult.error) {
      sessionError = "Unable to load the roster for this class.";
    } else {
      const studentIds = (enrolmentResult.data ?? []).map((row) => row.student_record_id);
      if (studentIds.length > 200) {
        sessionError = "This roster exceeds the current 200-student marking limit.";
      } else {
        const [directoryResult, marksResult] = await Promise.all([
          studentIds.length ? supabase.from("student_directory").select("student_record_id, registration_number, display_name").in("student_record_id", studentIds).order("registration_number") : Promise.resolve({ data: [], error: null }),
          sessionResult.data ? supabase.from("attendance_records").select("student_record_id, status").eq("session_id", sessionResult.data.id) : Promise.resolve({ data: [], error: null }),
        ]);
        if (directoryResult.error || marksResult.error) {
          sessionError = "Unable to load the roster for this class.";
        } else {
          const saved = new Map((marksResult.data ?? []).map((mark) => [mark.student_record_id, mark.status as "present" | "absent" | "late"]));
          roster = (directoryResult.data ?? []).map((student) => ({ studentRecordId: student.student_record_id, registrationNumber: student.registration_number, displayName: student.display_name, status: saved.get(student.student_record_id) ?? "" }));
        }
      }
    }
  }

  const studentSummaries = (studentSummaryResult.data ?? []) as unknown as AttendanceSummary[];
  const overallStudentSummary = summarizeAttendanceCounts(
    studentSummaries.reduce((total, summary) => total + summary.present_count, 0),
    studentSummaries.reduce((total, summary) => total + summary.absent_count, 0),
    studentSummaries.reduce((total, summary) => total + summary.late_count, 0),
  );
  const history = (studentHistoryResult.data ?? []) as unknown as Array<{ id: string; status: AttendanceStatus; session_date: string; subject_code: string; subject_name: string; section_code: string }>;
  const scopedSummaries = (summaryResult.data ?? []) as unknown as AttendanceSummary[];

  return (
    <AppShell roles={roles} displayName={displayName}>
      <PageHeader eyebrow="Academics" title="Attendance" description="Teacher marking, student history, and role-scoped reports from recorded class sessions." />
      {isTeacher ? (
        <Panel title="Mark a class" description="Choose one of your assigned scheduled classes and its calendar date.">
          {scheduleResult.error ? <Callout tone="danger" role="alert">Unable to load your assigned timetable.</Callout> : schedules.length === 0 ? <EmptyState title="No assigned classes" description="Attendance can be marked after an administrator schedules an offering assigned to you." /> : (
            <>
              <form method="get" action="/attendance" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <label className="text-sm font-medium">Scheduled class
                  <select name="entry" required defaultValue={entryId} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm">
                    <option value="">Select a class</option>{schedules.map((entry) => <option key={entry.id} value={entry.id}>{entry.offering.subject.code} · section {entry.offering.section_code} · {entry.offering.term.name} · {weekdays[entry.weekday - 1]} {entry.start_time.slice(0, 5)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">Session date
                  <input type="date" name="date" defaultValue={rawDate} required className="mt-1 min-h-11 rounded-lg border border-input-border px-3 text-sm" />
                </label>
                <button type="submit" className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">Load roster</button>
              </form>
              {entryId && !selectedSchedule ? <Callout tone="danger" role="alert" className="mt-4">That class is not assigned to your account.</Callout> : null}
              {selectedSchedule && !selectedDayMatches ? <Callout tone="warning" role="status" className="mt-4">Choose a date that falls on {weekdays[selectedSchedule.weekday - 1]}.</Callout> : null}
              {sessionError ? <Callout tone="danger" role="alert" className="mt-4">{sessionError}</Callout> : null}
              {selectedSchedule && selectedDayMatches && !sessionError ? (
                <div className="mt-5 border-t border-divider pt-4">
                  <h3 className="font-semibold">{selectedSchedule.offering.subject.code} · section {selectedSchedule.offering.section_code} · {rawDate}</h3>
                  {roster.length ? <div className="mt-4"><AttendanceForm key={`${selectedSchedule.id}-${rawDate}-${roster.map((row) => row.status).join("")}`} timetableEntryId={selectedSchedule.id} sessionDate={rawDate} roster={roster} /></div> : <EmptyState title="No enrolled students" description="This offering has no students to mark for this class." />}
                </div>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      {isStudent ? (
        <>
          <Panel title="My attendance summary" description="Percentage is present marks divided by recorded marks; late marks are shown separately and do not count as present.">
            {studentRecordResult.error || studentSummaryResult.error ? <Callout tone="danger" role="alert">Unable to load your attendance summary.</Callout> : studentRecordId ? overallStudentSummary.total === 0 ? <EmptyState title="No attendance recorded" description="Your attendance summary will appear after teachers record marks for scheduled classes." /> : (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[["Recorded", overallStudentSummary.total], ["Present", overallStudentSummary.present], ["Absent", overallStudentSummary.absent], ["Late", overallStudentSummary.late]].map(([label, count]) => <div key={label} className="rounded-lg bg-muted p-3"><dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-bold">{count}</dd></div>)}
                </dl>
                <p className="mt-4 text-sm font-semibold">Recorded attendance: {overallStudentSummary.percentage}%</p>
                <ul className="mt-4 divide-y divide-divider">
                  {studentSummaries.map((summary) => {
                    const percentage = summarizeAttendanceCounts(summary.present_count, summary.absent_count, summary.late_count).percentage;
                    return <li key={summary.offering_id} className="py-3"><p className="font-medium">{summary.subject_code} · section {summary.section_code}</p><p className="text-sm text-muted-foreground">{summary.recorded_sessions} marks · {summary.present_count} present · {summary.absent_count} absent · {summary.late_count} late · {percentage}%</p></li>;
                  })}
                </ul>
              </>
            ) : <EmptyState title="No student record linked" description="Attendance appears here after an administrator links your account to a student record." />}
          </Panel>
          <Panel title="Attendance history" description="Recorded class marks in reverse chronological order.">
            {studentHistoryResult.error ? <Callout tone="danger" role="alert">Unable to load attendance history.</Callout> : overallStudentSummary.total === 0 ? <EmptyState title="No history yet" description="There are no saved attendance marks for your record." /> : (
              <>
                <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><caption className="sr-only">Attendance history, page {historyPage}</caption><thead className="border-b border-divider text-xs uppercase text-muted-foreground"><tr><th scope="col" className="px-3 py-2">Date</th><th scope="col" className="px-3 py-2">Subject</th><th scope="col" className="px-3 py-2">Section</th><th scope="col" className="px-3 py-2">Status</th></tr></thead><tbody className="divide-y divide-divider">{history.map((item) => <tr key={item.id}><td className="px-3 py-3">{item.session_date}</td><td className="px-3 py-3">{item.subject_code} · {item.subject_name}</td><td className="px-3 py-3">{item.section_code}</td><td className="px-3 py-3"><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div>
                <nav aria-label="Attendance history pages" className="mt-4 flex items-center justify-between border-t border-divider pt-3">
                  <span className="text-sm text-muted-foreground">Page {historyPage} of {Math.max(1, Math.ceil(overallStudentSummary.total / historyPageSize))}</span>
                  {historyPage > 1 ? <Link href={`/attendance?page=${historyPage - 1}`} className="min-h-11 px-3 py-2 text-sm font-medium text-primary-text hover:underline">Previous</Link> : <span />}
                  {historyPage < Math.ceil(overallStudentSummary.total / historyPageSize) ? <Link href={`/attendance?page=${historyPage + 1}`} className="min-h-11 px-3 py-2 text-sm font-medium text-primary-text hover:underline">Next</Link> : <span />}
                </nav>
              </>
            )}
          </Panel>
        </>
      ) : null}

      {isTeacher || isAdmin ? (
        <Panel title={isAdmin ? "Institution attendance report" : "My offering summaries"} description="Counts include saved attendance marks only; unrecorded classes are not treated as absences.">
          {summaryResult.error ? <Callout tone="danger" role="alert">Unable to load scoped attendance summaries.</Callout> : scopedSummaries.length === 0 ? <EmptyState title="No attendance marks yet" description="Summaries appear after teachers save attendance for a class." /> : (
            <ul className="divide-y divide-divider">{scopedSummaries.map((summary) => <li key={summary.offering_id} className="py-3"><p className="font-medium">{summary.subject_code} · section {summary.section_code}</p><p className="text-sm text-muted-foreground">{summary.recorded_marks ?? 0} marks · {summary.present_count} present · {summary.absent_count} absent · {summary.late_count} late</p>{isTeacher ? <Link href={`/attendance?offering=${summary.offering_id}`} className="text-sm font-medium text-primary-text underline-offset-4 hover:underline">View class roster summary</Link> : null}</li>)}</ul>
          )}
          {isTeacher ? (
            <div className="mt-4 border-t border-divider pt-4">
              <form method="get" action="/attendance" className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="text-sm font-medium">Class roster report
                  <select name="offering" defaultValue={reportOfferingId} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm sm:w-auto">
                    <option value="">Select offering</option>{[...new Map(schedules.map((entry) => [entry.offering.id, entry.offering])).values()].map((offering) => <option key={offering.id} value={offering.id}>{offering.subject.code} · section {offering.section_code}</option>)}
                  </select>
                </label>
                <button type="submit" className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">View roster</button>
              </form>
              {studentReportResult.error ? <Callout tone="danger" role="alert" className="mt-3">Unable to load the selected class report.</Callout> : null}
              {reportOfferingId && !studentReportResult.error ? studentReportRows.length === 0 ? <EmptyState title="No enrolled students" description="This offering has no students on its roster." /> : (
                <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><caption className="sr-only">Attendance counts by enrolled student</caption><thead className="border-b border-divider text-xs uppercase text-muted-foreground"><tr><th scope="col" className="px-3 py-2">Student</th><th scope="col" className="px-3 py-2">Recorded</th><th scope="col" className="px-3 py-2">Present</th><th scope="col" className="px-3 py-2">Absent</th><th scope="col" className="px-3 py-2">Late</th></tr></thead><tbody className="divide-y divide-divider">{studentReportRows.map((row) => <tr key={row.student_record_id}><td className="px-3 py-3"><span className="font-medium">{row.display_name}</span><span className="block font-mono text-xs text-muted-foreground">{row.registration_number}</span></td><td className="px-3 py-3">{row.recorded_sessions}</td><td className="px-3 py-3">{row.present_count}</td><td className="px-3 py-3">{row.absent_count}</td><td className="px-3 py-3">{row.late_count}</td></tr>)}</tbody></table></div>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : null}
    </AppShell>
  );
}
