import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { buildAssignmentEvents, buildScheduleEvents, monthDates, normalizeMonth, type CalendarEvent, type CalendarSchedule } from "@/lib/calendar";
import { getAccess } from "@/lib/data/core";
import { listVisibleAssignments, listVisibleSchedule } from "@/lib/data/campus";

export const dynamic = "force-dynamic";

function describeDatabaseError(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const stringField = (field: string) => typeof value[field] === "string" ? value[field] as string : null;
  return {
    name: stringField("name") ?? (error instanceof Error ? error.name : "DatabaseError"),
    code: stringField("code"),
    message: stringField("message") ?? (error instanceof Error ? error.message : String(error)),
    details: stringField("details"),
    hint: stringField("hint"),
  };
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function EventLink({ event }: { event: CalendarEvent }) {
  const tone = event.kind === "class" ? "border-info/40 bg-info-soft text-info" : "border-warning/50 bg-warning-soft text-warning";
  return (
    <Link href={event.href} aria-label={`${event.kind === "class" ? "Class" : "Assignment deadline"}: ${event.title}. ${event.description}${event.time ? `. ${event.time}` : ""}`} className={`block rounded-md border-l-2 px-2 py-1.5 text-xs leading-4 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text ${tone}`}>
      {event.time ? <span className="block font-mono font-semibold">{event.time}</span> : null}
      <span className="block font-semibold">{event.kind === "assignment" ? "Due: " : ""}{event.title}</span>
      <span className="block">{event.description}</span>
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, roles, displayName } = await requireUserWithProfile();
  if (!roles.some(({ role }) => role === "admin" || role === "teacher" || role === "student")) redirect("/dashboard");
  const audience = hasRole(roles, "admin") ? "admin" : hasRole(roles, "teacher") ? "teacher" : "student";
  const requestedMonth = (await searchParams).month;
  const month = normalizeMonth(typeof requestedMonth === "string" ? requestedMonth : undefined);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const nextMonthStart = `${shiftMonth(month, 1)}-01`;
  const access = await getAccess(user.id);
  const [scheduleResult, assignmentResult] = await Promise.all([
    listVisibleSchedule(access),
    listVisibleAssignments(access, {
      status: "published",
      due_at: { $gte: new Date(`${monthStart}T00:00:00Z`), $lt: new Date(`${nextMonthStart}T00:00:00Z`) },
    }),
  ]);
  if (scheduleResult.error) console.error("[calendar] schedule query failed", describeDatabaseError(scheduleResult.error));
  if (assignmentResult.error) console.error("[calendar] assignment query failed", describeDatabaseError(assignmentResult.error));
  const schedules = (scheduleResult.data ?? []) as unknown as CalendarSchedule[];
  const assignments = (assignmentResult.data ?? []) as unknown as Array<{ id: string; title: string; due_at: string; status: string; offering: { section_code: string; subject: { code: string } } }>;
  const events = [...buildScheduleEvents(schedules, month, audience), ...buildAssignmentEvents(assignments)].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  const dates = monthDates(month);
  const mondayOffset = (new Date(`${monthStart}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridDates: Array<string | null> = [...Array.from({ length: mondayOffset }, () => null), ...dates];
  while (gridDates.length % 7) gridDates.push(null);
  const weeks = Array.from({ length: gridDates.length / 7 }, (_, index) => gridDates.slice(index * 7, index * 7 + 7));
  const visibleAgendaDays = dates.filter((date) => eventsByDate.has(date));
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));

  return (
    <AppShell roles={roles} displayName={displayName}>
      <PageHeader eyebrow="Planner" title="Academic calendar" description="Scheduled classes and published assignment deadlines for the selected month." actions={(
        <nav aria-label="Calendar month navigation" className="flex flex-wrap items-center gap-2">
          <Link href={`/calendar?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted">← Previous</Link>
          <Link href="/calendar" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted">Today</Link>
          <Link href={`/calendar?month=${shiftMonth(month, 1)}`} aria-label="Next month" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted">Next →</Link>
        </nav>
      )} />
      <div className="flex flex-wrap gap-4 text-sm" aria-label="Calendar event types">
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-sm bg-info" />Class session</span>
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-sm bg-warning" />Assignment deadline</span>
        <span className="ml-auto font-semibold">{monthLabel}</span>
      </div>
      {scheduleResult.error || assignmentResult.error ? <Callout tone="danger" role="alert">Some calendar events could not be loaded.</Callout> : null}
      {!scheduleResult.error && !assignmentResult.error && events.length === 0 ? <EmptyState title="No calendar events this month" description="Scheduled classes and published assignment deadlines will appear here when they exist." /> : null}
      {!scheduleResult.error && !assignmentResult.error && events.length > 0 ? (
        <>
          <Panel ariaLabel={`${monthLabel} month view`} className="hidden overflow-hidden p-0 md:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Academic calendar for {monthLabel}</caption>
              <thead className="border-b border-divider bg-muted text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <th key={day} scope="col" className="px-2 py-3 text-center">{day}</th>)}</tr></thead>
              <tbody className="divide-y divide-divider">{weeks.map((week, weekIndex) => <tr key={weekIndex}>{week.map((date, dayIndex) => (
                <td key={`${weekIndex}-${dayIndex}`} className={`h-36 align-top border-r border-divider p-2 last:border-r-0 ${date ? "" : "bg-muted/40"}`}>
                  {date ? <>
                    <time dateTime={date} className={`mb-2 block text-xs font-semibold ${date.startsWith(month) ? "text-foreground" : "text-muted-foreground"}`}>{formatDate(date, { day: "numeric", month: "short" })}</time>
                    <ul className="space-y-1">{(eventsByDate.get(date) ?? []).slice(0, 3).map((event) => <li key={event.id}><EventLink event={event} /></li>)}</ul>
                    {(eventsByDate.get(date)?.length ?? 0) > 3 ? <p className="mt-1 text-xs text-muted-foreground">+{eventsByDate.get(date)!.length - 3} more</p> : null}
                  </> : null}
                </td>
              ))}</tr>)}</tbody>
            </table>
          </Panel>
          <section aria-label={`${monthLabel} agenda`} className="space-y-3 md:hidden">
            {visibleAgendaDays.map((date) => <Panel key={date} title={formatDate(date, { weekday: "long", month: "long", day: "numeric" })}>
              <ul className="space-y-2">{(eventsByDate.get(date) ?? []).map((event) => <li key={event.id}><EventLink event={event} /></li>)}</ul>
            </Panel>)}
          </section>
        </>
      ) : null}
      {scheduleResult.data?.length === 500 || assignmentResult.data?.length === 500 ? <Callout tone="warning">The calendar event limit was reached. Narrowing this month’s events is not available yet.</Callout> : null}
    </AppShell>
  );
}
