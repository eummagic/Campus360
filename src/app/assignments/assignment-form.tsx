"use client";

import { useActionState } from "react";
import { Callout } from "@/components/ui/callout";
import { createAssignment, type AssignmentActionResult } from "./actions";

type OfferingOption = { id: string; label: string };

export function AssignmentForm({ offerings }: { offerings: OfferingOption[] }) {
  const [state, action, pending] = useActionState<AssignmentActionResult | null, FormData>(createAssignment, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Assigned offering
        <select name="offeringId" required className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm"><option value="">Select offering</option>{offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.label}</option>)}</select>
      </label>
      <label className="text-sm font-medium">Title
        <input name="title" required maxLength={160} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
      </label>
      <label className="text-sm font-medium">Due date and time (UTC)
        <input type="datetime-local" name="dueAt" required className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
      </label>
      <label className="text-sm font-medium">Publication
        <select name="status" defaultValue="draft" className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm"><option value="draft">Draft</option><option value="published">Published to students</option></select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">Instructions
        <textarea name="instructions" maxLength={10000} rows={4} className="mt-1 w-full rounded-lg border border-input-border px-3 py-2 text-sm" />
      </label>
      {state && !state.ok ? <Callout tone="danger" role="alert" className="sm:col-span-2">{state.message}</Callout> : null}
      {state?.ok ? <Callout tone="success" role="status" className="sm:col-span-2">Assignment saved.</Callout> : null}
      <button type="submit" disabled={pending || offerings.length === 0} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2">{pending ? "Saving…" : "Create assignment"}</button>
    </form>
  );
}
