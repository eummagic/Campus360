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

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="timetableEntryId" value={timetableEntryId} />
      <input type="hidden" name="sessionDate" value={sessionDate} />
      <input type="hidden" name="records" value={JSON.stringify(rows.map(({ studentRecordId, status }) => ({ studentRecordId, status })))} />
      <div className="divide-y divide-divider">
        {rows.map((row, index) => (
          <div key={row.studentRecordId} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{row.displayName}</p><p className="font-mono text-xs text-muted-foreground">{row.registrationNumber}</p></div>
            <label className="text-sm font-medium">Status for {row.displayName}
              <select aria-label={`Status for ${row.displayName}`} value={row.status} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value as Mark } : item))} className="ml-3 min-h-11 rounded-lg border border-input-border bg-input px-3">
                <option value="">Choose status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option>
              </select>
            </label>
          </div>
        ))}
      </div>
      {state?.ok ? <Callout tone="success" role="status">Attendance saved. Existing marks were updated where applicable.</Callout> : null}
      {state && !state.ok ? <Callout tone="danger" role="alert">{state.message}</Callout> : null}
      <button type="submit" disabled={!complete || pending} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save attendance"}</button>
    </form>
  );
}
