"use client";

import { useActionState } from "react";
import { updateDisplayName, type UpdateProfileResult } from "./actions";

export function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [state, formAction, pending] = useActionState<UpdateProfileResult | null, FormData>(
    updateDisplayName,
    null,
  );

  return (
    <section aria-labelledby="edit-heading">
      <h2 id="edit-heading" className="text-lg font-medium">Edit display name</h2>
      <form action={formAction} className="mt-3 space-y-4">
        <div>
          <label htmlFor="displayName" className="text-sm font-medium">Display name</label>
          <input
            id="displayName"
            name="displayName"
            required
            minLength={1}
            maxLength={120}
            defaultValue={initialDisplayName}
            className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm"
            aria-invalid={state && !state.ok ? "true" : "false"}
          />
        </div>
        {state?.ok ? <p role="status" className="text-sm text-green-700">Display name updated.</p> : null}
        {state && !state.ok ? <p role="alert" className="text-sm text-red-600">{state.message}</p> : null}
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}
