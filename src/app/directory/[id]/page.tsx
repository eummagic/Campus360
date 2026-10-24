import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { hasRole, isStaff, requireUserWithProfile } from "@/lib/auth";
import { getDirectoryEntry, listEnrolmentsForRecord } from "@/lib/academics";

export const dynamic = "force-dynamic";

export default async function DirectoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, roles, displayName } = await requireUserWithProfile();
  const { id } = await params;
  const { row, error } = await getDirectoryEntry(id);
  if (error || !row) notFound();
  if (!isStaff(roles) && row.user_id !== user.id) redirect("/dashboard");

  const { rows, error: enrolmentError } = await listEnrolmentsForRecord(id);
  return (
    <AppShell roles={roles} displayName={displayName}>
      <div className="w-full max-w-4xl space-y-6">
      <header>
        <Link href="/directory" className="text-sm font-medium text-primary underline-offset-4 hover:underline">← Back to directory</Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-primary">Student record</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{row.display_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{row.registration_number} · {row.program_code}</p>
      </header>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Record details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Program</dt><dd className="mt-1">{row.program_name}</dd></div>
          <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</dt><dd className="mt-1">{row.department_name}</dd></div>
          <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-1 capitalize">{row.record_status}</dd></div>
          <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact email</dt><dd className="mt-1">{row.contact_email ?? "—"}</dd></div>
        </dl>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Enrolments</h2>
        {enrolmentError ? <p role="alert" className="text-sm text-red-600">Unable to load enrolments.</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No enrolments yet.</p> : (
          <ul className="mt-3 divide-y text-sm">
            {rows.map((row) => {
              const enrolment = row as unknown as { id: string; offering: { section_code: string; subject: { code: string; name: string }; term: { name: string } } };
              return <li key={enrolment.id} className="py-3 first:pt-0">{enrolment.offering.subject.code} {enrolment.offering.subject.name}<span className="text-muted-foreground"> — section {enrolment.offering.section_code} — {enrolment.offering.term.name}</span></li>;
            })}
          </ul>
        )}
      </section>
      {hasRole(roles, "admin") ? <p className="text-xs text-muted-foreground">Administrative mutations for this record are not exposed in Phase 2A.</p> : null}
      </div>
    </AppShell>
  );
}
