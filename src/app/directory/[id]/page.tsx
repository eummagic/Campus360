import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const isAdmin = hasRole(roles, "admin");
  const isTeacher = hasRole(roles, "teacher");
  const breadcrumbs = isStaff(roles)
    ? [{ label: "Student directory", href: "/directory" }, { label: row.display_name }]
    : [{ label: "Dashboard", href: "/dashboard" }, { label: "My record" }];
  const enrolmentTitle = isAdmin ? "Enrolments" : isTeacher ? "Enrolments in your offerings" : "My enrolments";

  return (
    <AppShell roles={roles} displayName={displayName}>
      <div className="w-full max-w-4xl space-y-6">
        <div>
          <Breadcrumbs items={breadcrumbs} />
          <PageHeader eyebrow="Student record" title={row.display_name} description={`${row.registration_number} · ${row.program_code}`} actions={<StatusBadge status={row.record_status} />} />
        </div>

        <Panel title="Record details">
          <dl className="grid divide-y divide-divider text-sm sm:grid-cols-2 sm:divide-y-0">
            <div className="py-3 sm:border-b sm:border-divider sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Program</dt><dd className="mt-1 font-medium">{row.program_name}</dd></div>
            <div className="py-3 sm:border-b sm:border-divider sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</dt><dd className="mt-1 font-medium">{row.department_name}</dd></div>
            <div className="py-3 sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={row.record_status} /></dd></div>
            <div className="py-3 sm:px-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact email</dt><dd className="mt-1">{row.contact_email ?? "Not provided"}</dd></div>
          </dl>
        </Panel>

        <Panel title={enrolmentTitle}>
          {enrolmentError ? <Callout tone="danger" role="alert">Unable to load enrolments.</Callout> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrolments yet.</p>
          ) : (
            <ul className="divide-y divide-divider text-sm">
              {rows.map((row) => {
                const enrolment = row as unknown as { id: string; offering: { id: string; section_code: string; subject: { code: string; name: string }; term: { name: string } } };
                return <li key={enrolment.id} className="py-3 first:pt-0"><Link href={`/subjects/${enrolment.offering.id}`} className="font-mono font-medium text-primary-text underline-offset-4 hover:underline">{enrolment.offering.subject.code}</Link> {enrolment.offering.subject.name}<span className="text-muted-foreground"> — section {enrolment.offering.section_code} — {enrolment.offering.term.name}</span></li>;
              })}
            </ul>
          )}
        </Panel>
        {isAdmin ? <p className="text-sm text-muted-foreground">Administrative mutations for this record are not exposed in Phase 2A.</p> : null}
      </div>
    </AppShell>
  );
}
