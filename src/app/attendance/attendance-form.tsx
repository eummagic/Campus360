"use client";

import { useActionState, useState } from "react";
import { Callout } from "@/components/ui/callout";
import { markAttendance, type AttendanceActionResult } from "./actions";

type Mark = "present" | "absent" | "late" | "";
type RosterRow = { studentRecordId: string; registrationNumber: string; displayName: string; status: Mark };

export function AttendanceForm({ timetableEntryId, sessionDate, roster }: { timetableEntryId: string; sessionDate: string; roster: RosterRow[] }) {
  const [rows, setRows] = useState(roster);
  const [state, action, pending] = useActionState<AttendanceActionResult | null, FormData>(markAttendance, null);
  const complete = rows.length > 0 && rows.every((row) => row.status !== "");
  const setAll = (status: "present" | "absent") => setRows((current) => current.map((row) => ({ ...row, status })));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="timetableEntryId" value={timetableEntryId} />
      <input type="hidden" name="sessionDate" value={sessionDate} />
      <input type="hidden" name="records" value={JSON.stringify(rows.map(({ studentRecordId, status }) => ({ studentRecordId, status })))} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Set attendance for the whole roster">
        <button type="button" onClick={() => setAll("present")} disabled={pending} className="min-h-11 rounded-lg border border-success/50 bg-success-soft px-4 text-sm font-semibold text-success hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text disabled:opacity-60">Set all present</button>
        <button type="button" onClick={() => setAll("absent")} disabled={pending} className="min-h-11 rounded-lg border border-danger/50 bg-danger-soft px-4 text-sm font-semibold text-danger hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text disabled:opacity-60">Set all absent</button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, index) => {
          const nextStatus = row.status === "present" ? "absent" : "present";
          const label = row.status === "present" ? "Present · click to mark absent" : row.status === "absent" ? "Absent · click to mark present" : row.status === "late" ? "Late · click to change to present" : "Not marked · click to mark present";
          const tone = row.status === "present" ? "border-success/50 bg-success-soft text-success" : row.status === "absent" ? "border-danger/50 bg-danger-soft text-danger" : "border-border bg-muted text-foreground";
          return (
            <li key={row.studentRecordId} className="rounded-xl border border-border bg-card p-3">
              <p className="font-medium">{row.displayName}</p>
              <p className="font-mono text-xs text-muted-foreground">{row.registrationNumber}</p>
              <button type="button" aria-label={`${label} for ${row.displayName}`} aria-pressed={row.status === "present"} disabled={pending}
                onClick={() => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: nextStatus } : item))}
                className={`mt-3 min-h-12 w-full rounded-lg border px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text ${tone}`}>
                {row.status === "present" ? "Present" : row.status === "absent" ? "Absent" : row.status === "late" ? "Late · choose status" : "Not marked · choose status"}
              </button>
            </li>
          );
        })}
      </ul>
      {state?.ok ? <Callout tone="success" role="status">Attendance saved. Existing marks were updated where applicable.</Callout> : null}
      {state && !state.ok ? <Callout tone="danger" role="alert">{state.message}</Callout> : null}
      <button type="submit" disabled={!complete || pending} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save attendance"}</button>
    </form>
  );
}
