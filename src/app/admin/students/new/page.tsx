import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateStudentForm } from "./create-student-form";

export const dynamic = "force-dynamic";

type UnlinkedStudent = { user_id: string; display_name: string; contact_email: string | null };

export default async function NewStudentPage() {
  const { roles, displayName } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) redirect("/dashboard");

  const supabase = await createClient();
  const [candidateResult, programResult] = await Promise.all([
    supabase.rpc("list_unlinked_student_users"),
    supabase.from("programs").select("id, code, name").order("code"),
  ]);
  const candidates = (candidateResult.data ?? []) as UnlinkedStudent[];
  const hasError = candidateResult.error || programResult.error;

  return (
    <AppShell roles={roles} displayName={displayName}>
      <header>
        <h1 className="text-2xl font-semibold">Create student record</h1>
        <p className="text-sm text-muted-foreground">Links an existing student account to an academic record. Account creation is out of scope.</p>
      </header>
      {hasError ? <p role="alert" className="rounded-md border border-red-500 p-3 text-sm text-red-600">Unable to load student accounts or programs.</p> : null}
      {!hasError && candidates.length === 0 ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">No unlinked student accounts are available.</div>
      ) : null}
      {!hasError && candidates.length > 0 ? (
        <CreateStudentForm
          candidates={candidates.map((candidate) => ({
            user_id: candidate.user_id,
            display_name: candidate.display_name,
            contact_email: candidate.contact_email,
          }))}
          programs={programResult.data ?? []}
        />
      ) : null}
    </AppShell>
  );
}
