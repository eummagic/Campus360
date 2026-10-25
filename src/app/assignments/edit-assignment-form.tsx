"use client";

import { useActionState } from "react";
import { Callout } from "@/components/ui/callout";
import { updateAssignment, type AssignmentActionResult } from "./actions";

type OfferingOption = { id: string; label: string };
type AssignmentInput = { id: string; offeringId: string; title: string; instructions: string; dueAt: string; status: "draft" | "published" };

export function EditAssignmentForm({ assignment, offerings }: { assignment: AssignmentInput; offerings: OfferingOption[] }) {
  const [state, action, pending] = useActionState<AssignmentActionResult | null, FormData>(updateAssignment, null);
  return (
    <details className="mt-3 rounded-lg border border-border px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary-text">Edit assignment</summary>
      <form action={action} className="grid gap-3 pb-3 sm:grid-cols-2">
        <input type="hidden" name="assignmentId" value={assignment.id} />
        <label className="text-sm font-medium">Assigned offering
          <select name="offeringId" required defaultValue={assignment.offeringId} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm">{offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.label}</option>)}</select>
        </label>
        <label className="text-sm font-medium">Title
          <input name="title" required maxLength={160} defaultValue={assignment.title} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
        </label>
        <label className="text-sm font-medium">Due date and time (UTC)
          <input type="datetime-local" name="dueAt" required defaultValue={assignment.dueAt.slice(0, 16)} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm" />
        </label>
        <label className="text-sm font-medium">Publication
          <select name="status" defaultValue={assignment.status} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm"><option value="draft">Draft</option><option value="published">Published to students</option></select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">Instructions
          <textarea name="instructions" maxLength={10000} rows={4} defaultValue={assignment.instructions} className="mt-1 w-full rounded-lg border border-input-border px-3 py-2 text-sm" />
        </label>
        {state && !state.ok ? <Callout tone="danger" role="alert" className="sm:col-span-2">{state.message}</Callout> : null}
        {state?.ok ? <Callout tone="success" role="status" className="sm:col-span-2">Assignment updated.</Callout> : null}
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60 sm:col-span-2">{pending ? "Saving…" : "Save changes"}</button>
      </form>
    </details>
  );
}
