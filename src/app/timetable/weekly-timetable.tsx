"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { getSubjectColorIndex } from "@/lib/subject-color";
import { formatCampusTime, getSessionDisplayKind, layoutDayEntries, type TimetableDisplayEntry } from "@/lib/timetable";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const minuteHeight = 2;

function dayIndexFromDate(date: Date) {
  return (date.getDay() + 6) % 7;
}

function accentStyle(subjectCode: string): CSSProperties {
  const color = getSubjectColorIndex(subjectCode);
  return { "--subject-accent": `hsl(var(--subject-${color}))` } as CSSProperties;
}

function TimetableLink({ entry, now, compact = false }: { entry: TimetableDisplayEntry; now: Date | null; compact?: boolean }) {
  const startMinute = entry.startMinute;
  const endMinute = entry.endMinute;
  const currentMinute = now ? now.getHours() * 60 + now.getMinutes() : -1;
  const isCurrent = now !== null && dayIndexFromDate(now) === entry.dayIndex && currentMinute >= startMinute && currentMinute < endMinute;
  const displayKind = getSessionDisplayKind(entry.subjectName);
  const shortKind = displayKind === "Lab session" ? "Lab" : displayKind === "Project period" ? "Project" : displayKind === "Self-study" ? "Self-study" : "Class";

  return (
    <Link
      href={`/subjects/${entry.offeringId}`}
      aria-label={`${entry.subjectCode}, ${entry.subjectName}, section ${entry.sectionCode}, ${formatCampusTime(entry.startTime)} to ${formatCampusTime(entry.endTime)}. Open subject page.`}
      className={`group block min-w-0 rounded-lg border border-border border-l-4 bg-card px-2.5 py-2 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:transform-none ${isCurrent ? "ring-2 ring-primary-text" : ""} ${compact ? "min-h-16" : "h-full overflow-hidden"}`}
      style={{ ...accentStyle(entry.subjectCode), borderLeftColor: "var(--subject-accent)" }}
    >
      <span className="flex items-center justify-between gap-x-1 text-xs font-semibold">
        <span>{formatCampusTime(entry.startTime)}–{formatCampusTime(entry.endTime)}</span>
        {isCurrent ? <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-primary-text">Now</span> : null}
      </span>
      <span className="mt-1 flex items-center justify-between gap-1">
        <span className="block truncate text-sm font-bold leading-5" style={{ color: "var(--subject-accent)" }}>{entry.subjectCode}</span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-3 text-muted-foreground">{shortKind}</span>
      </span>
      <span className={`block text-xs leading-4 text-muted-foreground ${compact ? "" : "line-clamp-1"}`}>{entry.subjectName}</span>
      {compact ? <span className="mt-1 block text-xs text-muted-foreground">Section {entry.sectionCode}{entry.location ? ` · ${entry.location}` : ""}</span> : null}
    </Link>
  );
}

export function WeeklyTimetable({ entries }: { entries: TimetableDisplayEntry[] }) {
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    const update = () => {
      const current = new Date();
      setNow(current);
      setSelectedDay(dayIndexFromDate(current));
    };
    update();
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { minMinute, maxMinute, ticks, byDay } = useMemo(() => {
    const minEntry = entries.length ? Math.min(...entries.map((entry) => entry.startMinute)) : 0;
    const maxEntry = entries.length ? Math.max(...entries.map((entry) => entry.endMinute)) : 60;
    const start = Math.floor(minEntry / 60) * 60;
    const end = Math.ceil(maxEntry / 60) * 60;
    const rangeEnd = Math.max(end, start + 60);
    const tickMinutes: number[] = [];
    for (let value = start; value <= rangeEnd; value += 60) tickMinutes.push(value);
    const grouped = days.map((_, dayIndex) => layoutDayEntries(entries.filter((entry) => entry.dayIndex === dayIndex)));
    return { minMinute: start, maxMinute: rangeEnd, ticks: tickMinutes, byDay: grouped };
  }, [entries]);

  const scheduleHeight = (maxMinute - minMinute) * minuteHeight;
  const todayIndex = now ? dayIndexFromDate(now) : -1;

  return (
    <>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden" role="group" aria-label="Choose a day">
        {days.map((day, index) => (
          <button key={day} type="button" onClick={() => setSelectedDay(index)} aria-pressed={selectedDay === index} aria-current={todayIndex === index ? "date" : undefined}
            className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text ${selectedDay === index ? "border-primary bg-primary-soft text-primary-text" : "border-border bg-card hover:bg-muted"}`}>
            {day.slice(0, 3)}{todayIndex === index ? <span className="sr-only">, today</span> : null}
          </button>
        ))}
      </div>

      <section className="md:hidden" aria-label={`${days[selectedDay]} classes`}>
        <h2 className="sr-only">{days[selectedDay]}</h2>
        {byDay[selectedDay].length ? (
          <ol className="space-y-3">
            {byDay[selectedDay].map(({ entry }) => <li key={entry.id}><TimetableLink entry={entry} now={now} compact /></li>)}
          </ol>
        ) : <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No classes scheduled for {days[selectedDay]}.</p>}
      </section>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block" tabIndex={0} aria-label="Scrollable weekly timetable">
        <div role="table" aria-label="Weekly timetable" className="min-w-[68rem]">
          <div role="row" className="grid grid-cols-[4.5rem_repeat(7,minmax(9rem,1fr))] border-b border-divider bg-muted">
            <div role="columnheader" className="sticky left-0 z-20 flex items-center bg-muted px-2 py-3 text-xs font-semibold text-muted-foreground">Time</div>
            {days.map((day, index) => (
              <div role="columnheader" key={day} aria-current={todayIndex === index ? "date" : undefined}
                className={`border-l border-divider px-2 py-3 text-center text-sm font-semibold ${todayIndex === index ? "bg-primary-soft text-primary-text" : ""}`}>
                {day}{todayIndex === index ? <span className="sr-only">, today</span> : null}
              </div>
            ))}
          </div>
          <div role="row" className="grid grid-cols-[4.5rem_repeat(7,minmax(9rem,1fr))]">
            <div role="rowheader" className="relative border-r border-divider bg-card" style={{ height: scheduleHeight }}>
              {ticks.map((minute) => (
                <span key={minute} className="absolute right-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground" style={{ top: (minute - minMinute) * minuteHeight, transform: minute === minMinute ? "none" : "translateY(-50%)" }}>
                  {formatCampusTime(`${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`)}
                </span>
              ))}
            </div>
            {days.map((day, dayIndex) => (
              <div role="cell" aria-label={`${day}, ${byDay[dayIndex].length} classes`} key={day}
                className={`relative border-r border-divider last:border-r-0 ${todayIndex === dayIndex ? "bg-primary-soft/20" : ""}`}
                style={{ height: scheduleHeight, backgroundImage: "linear-gradient(to bottom, hsl(var(--divider)) 1px, transparent 1px)", backgroundSize: `100% ${60 * minuteHeight}px` }}>
                {byDay[dayIndex].length === 0 ? <span className="absolute left-2 top-2 text-xs text-muted-foreground">No classes</span> : null}
                {byDay[dayIndex].map(({ entry, lane, laneCount }) => (
                  <div key={entry.id} className="absolute p-1" style={{
                    top: (entry.startMinute - minMinute) * minuteHeight,
                    height: (entry.endMinute - entry.startMinute) * minuteHeight,
                    left: `${(lane / laneCount) * 100}%`,
                    width: `${100 / laneCount}%`,
                  }}>
                    <TimetableLink entry={entry} now={now} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Times are shown as campus wall-clock values stored with each class. Today and current-class highlights follow your device clock. Select a class to view its subject page.</p>
    </>
  );
}
