import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeToMinutes, type TimetableDisplayEntry } from "@/lib/timetable";
import { deleteTimetableEntry } from "./actions";
import { TimetableEntryForm } from "./timetable-entry-form";
import { WeeklyTimetable } from "./weekly-timetable";

export const dynamic = "force-dynamic";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type TimetableRow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  offering: {
    id: string;
    section_code: string;
    term: { name: string; status: string };
    subject: { code: string; name: string };
  };
};

function describeDatabaseError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const stringField = (key: string) => typeof record[key] === "string" ? record[key] as string : null;
  return {
    name: stringField("name") ?? (error instanceof Error ? error.name : "DatabaseError"),
    code: stringField("code"),
    message: stringField("message") ?? (error instanceof Error ? error.message : String(error)),
    details: stringField("details"),
    hint: stringField("hint"),
  };
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { roles, displayName } = await requireUserWithProfile();
  if (!roles.some(({ role }) => role === "admin" || role === "teacher" || role === "student")) redirect("/dashboard");
  const query = await searchParams;
  const isAdmin = hasRole(roles, "admin");
  const supabase = await createClient();
  const [scheduleResult, offeringsResult] = await Promise.all([
    supabase.from("timetable_entries")
      .select("id, weekday, start_time, end_time, location, offering:course_offerings(id, section_code, term:academic_terms(name, status), subject:subjects(code, name))")
      .order("weekday").order("start_time").limit(500),
    isAdmin
      ? supabase.from("course_offerings").select("id, section_code, term:academic_terms!inner(name, status), subject:subjects(code, name)").eq("status", "active").eq("term.status", "active").order("section_code")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (scheduleResult.error) {
    console.error(`[timetable] schedule query failed ${JSON.stringify(describeDatabaseError(scheduleResult.error))}`);
  }
  if (offeringsResult.error) {
    console.error(`[timetable] active offerings query failed ${JSON.stringify(describeDatabaseError(offeringsResult.error))}`);
  }
  const rows = ((scheduleResult.data ?? []) as unknown as TimetableRow[]).filter((row) => row.offering.term.status === "active");
  const entries: TimetableDisplayEntry[] = rows.flatMap((row) => {
    const startMinute = timeToMinutes(row.start_time);
    const endMinute = timeToMinutes(row.end_time);
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || row.weekday < 1 || row.weekday > 7) return [];
    return [{
      id: row.id,
      offeringId: row.offering.id,
      dayIndex: row.weekday - 1,
      startTime: row.start_time,
      endTime: row.end_time,
      startMinute,
      endMinute,
      location: row.location,
      sectionCode: row.offering.section_code,
      subjectCode: row.offering.subject.code,
      subjectName: row.offering.subject.name,
    }];
  });
  const offerings = (offeringsResult.data ?? []).map((row) => {
    const value = row as unknown as { id: string; section_code: string; term: { name: string }; subject: { code: string; name: string } };
    return { id: value.id, label: `${value.subject.code} — ${value.subject.name} · ${value.term.name} · section ${value.section_code}` };
  });
  return (
    <AppShell roles={roles} displayName={displayName}>
      <PageHeader eyebrow="Academics" title="Class timetable" description="Recurring class times for your enrolled or assigned offerings. Times use campus local time." />
      {query.error === "attendance" ? <Callout tone="warning" role="alert">This class has attendance history and can&apos;t be removed.</Callout> : null}
      {query.error === "remove" ? <Callout tone="danger" role="alert">Unable to remove this class time.</Callout> : null}
      {query.removed === "1" ? <Callout tone="success" role="status">Class time removed.</Callout> : null}
      {scheduleResult.error ? <Callout tone="danger" role="alert">Unable to load the timetable.</Callout> : null}
      {isAdmin ? (
        <Panel title="Add a class time" description="Choose an active offering. Room and teacher conflicts are checked when saved.">
          {offeringsResult.error ? <Callout tone="danger" role="alert">Course offerings could not be loaded.</Callout> : offerings.length ? <TimetableEntryForm offerings={offerings} /> : <EmptyState title="No active offerings" description="Activate an academic offering before scheduling a class." />}
        </Panel>
      ) : null}
      {!scheduleResult.error && entries.length === 0 ? (
        <EmptyState title="No timetable entries yet" description="Scheduled classes appear here when an administrator adds class times for active offerings." />
      ) : null}
      {!scheduleResult.error && entries.length > 0 ? <WeeklyTimetable entries={entries} /> : null}
      {!scheduleResult.error && isAdmin && entries.length > 0 ? (
        <Panel title="Manage scheduled classes" description="Removing a class time is blocked if attendance has already been recorded." className="mt-6">
          <ul className="divide-y divide-divider">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <p className="text-sm"><span className="font-mono font-semibold">{entry.startTime.slice(0, 5)}–{entry.endTime.slice(0, 5)}</span> · {entry.subjectCode}, section {entry.sectionCode} · {weekdays[entry.dayIndex]}</p>
                <form action={deleteTimetableEntry}>
                  <input type="hidden" name="entryId" value={entry.id} />
                  <button type="submit" className="min-h-11 rounded-lg px-3 text-sm font-medium text-danger underline-offset-4 hover:bg-danger-soft hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">Remove class time</button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {!scheduleResult.error && scheduleResult.data?.length === 500 ? <Callout tone="warning">Showing the first 500 timetable entries. Ask an administrator to narrow the active schedule.</Callout> : null}
    </AppShell>
  );
}
