import { redirect } from "next/navigation";
import Link from "next/link";
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
        <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">← Back to dashboard</Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-primary">Administration</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Create student record</h1>
        <p className="text-sm text-muted-foreground">Links an existing student account to an academic record. Account creation is out of scope.</p>
      </header>
      {hasError ? <p role="alert" className="rounded-md border border-red-500 p-3 text-sm text-red-600">Unable to load student accounts or programs.</p> : null}
      {!hasError && candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center shadow-sm"><p className="font-semibold text-foreground">No unlinked student accounts are available.</p><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">The account list could not provide any eligible students for this form.</p></div>
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
