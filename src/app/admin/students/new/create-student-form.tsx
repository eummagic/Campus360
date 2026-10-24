"use client";

import { useActionState } from "react";
import { createStudentRecord, type CreateStudentResult } from "../actions";

export function CreateStudentForm({
  candidates,
  programs,
}: {
  candidates: Array<{ user_id: string; display_name: string; contact_email: string | null }>;
  programs: Array<{ id: string; code: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<CreateStudentResult | null, FormData>(createStudentRecord, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-5 rounded-xl border bg-card p-6 shadow-sm">
      <div><h2 className="text-lg font-semibold">Student details</h2><p className="mt-1 text-sm text-muted-foreground">Link an existing account to an academic program.</p></div>
      <div>
        <label htmlFor="userId" className="text-sm font-medium">Student account</label>
        <select id="userId" name="userId" required className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm">
          <option value="">Select an account</option>
          {candidates.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name}{candidate.contact_email ? ` (${candidate.contact_email})` : ""}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="registrationNumber" className="text-sm font-medium">Registration number</label>
        <input id="registrationNumber" name="registrationNumber" required maxLength={40} className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm" />
      </div>
      <div>
        <label htmlFor="programId" className="text-sm font-medium">Program</label>
        <select id="programId" name="programId" required className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm">
          <option value="">Select a program</option>
          {programs.map((program) => <option key={program.id} value={program.id}>{program.code} — {program.name}</option>)}
        </select>
      </div>
      {state?.ok ? <p role="status" className="text-sm text-green-700">Student record created.</p> : null}
      {state && !state.ok ? <p role="alert" className="text-sm text-red-600">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Creating…" : "Create record"}
      </button>
    </form>
  );
}
