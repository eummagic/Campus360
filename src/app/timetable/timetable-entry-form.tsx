"use client";

import { useActionState } from "react";
import { Callout } from "@/components/ui/callout";
import { createTimetableEntry, type TimetableActionResult } from "./actions";

type OfferingOption = { id: string; label: string };

export function TimetableEntryForm({ offerings }: { offerings: OfferingOption[] }) {
  const [state, action, pending] = useActionState<TimetableActionResult | null, FormData>(createTimetableEntry, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm font-medium sm:col-span-2 xl:col-span-1">Offering
        <select name="offeringId" required className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm">
          <option value="">Select offering</option>{offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Weekday
        <select name="weekday" required defaultValue="1" className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm">
          <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="7">Sunday</option>
        </select>
      </label>
      <label className="text-sm font-medium">Start time (campus local)
        <input type="time" name="startTime" required className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
      </label>
      <label className="text-sm font-medium">End time
        <input type="time" name="endTime" required className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
      </label>
      <label className="text-sm font-medium">Room / location
        <input name="location" maxLength={100} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
      </label>
      {state && !state.ok ? <Callout tone="danger" role="alert" className="sm:col-span-2 xl:col-span-5">{state.message}</Callout> : null}
      {state?.ok ? <Callout tone="success" role="status" className="sm:col-span-2 xl:col-span-5">Class time added.</Callout> : null}
      <button type="submit" disabled={pending || offerings.length === 0} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2 xl:col-span-5">{pending ? "Saving…" : "Add class time"}</button>
    </form>
  );
}
