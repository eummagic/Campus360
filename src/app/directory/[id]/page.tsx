import { notFound, redirect } from "next/navigation";
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
      <header>
        <h1 className="text-2xl font-semibold">{row.display_name}</h1>
        <p className="text-sm text-muted-foreground">{row.registration_number} · {row.program_code}</p>
      </header>
      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-medium">Record</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Program</dt><dd>{row.program_name}</dd></div>
          <div><dt className="text-muted-foreground">Department</dt><dd>{row.department_name}</dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd>{row.record_status}</dd></div>
          <div><dt className="text-muted-foreground">Contact email</dt><dd>{row.contact_email ?? "—"}</dd></div>
        </dl>
      </section>
      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-medium">Enrolments</h2>
        {enrolmentError ? <p role="alert" className="text-sm text-red-600">Unable to load enrolments.</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No enrolments yet.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {rows.map((row) => {
              const enrolment = row as unknown as { id: string; offering: { section_code: string; subject: { code: string; name: string }; term: { name: string } } };
              return <li key={enrolment.id}>{enrolment.offering.subject.code} {enrolment.offering.subject.name} — section {enrolment.offering.section_code} — {enrolment.offering.term.name}</li>;
            })}
          </ul>
        )}
      </section>
      {hasRole(roles, "admin") ? <p className="text-xs text-muted-foreground">Administrative mutations for this record are not exposed in Phase 2A.</p> : null}
    </AppShell>
  );
}
