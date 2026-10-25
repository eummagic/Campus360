import Link from "next/link";
import { Search } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasRole, isStaff, requireUserWithProfile } from "@/lib/auth";
import { listDirectory, listReferenceData } from "@/lib/academics";
import { createClient } from "@/lib/supabase/server";
import { directorySearchSchema, type DirectorySearch } from "@/lib/validation/academic";

export const dynamic = "force-dynamic";

type OfferingOption = {
  offering: {
    id: string;
    section_code: string;
    term: { name: string };
    subject: { code: string; name: string };
  };
};

type FilterKey = keyof DirectorySearch;

function filterHref(filters: DirectorySearch, excluded?: FilterKey) {
  const params = new URLSearchParams();
  if (excluded !== "q" && filters.q) params.set("q", filters.q);
  if (excluded !== "program" && filters.program) params.set("program", filters.program);
  if (excluded !== "status" && filters.status) params.set("status", filters.status);
  if (excluded !== "offering" && filters.offering) params.set("offering", filters.offering);
  const query = params.toString();
  return query ? `/directory?${query}` : "/directory";
}

function rawQueryHref(raw: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const entry of value) params.append(key, entry);
  }
  const query = params.toString();
  return query ? `/directory?${query}` : "/directory";
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roles, displayName } = await requireUserWithProfile();
  if (!isStaff(roles)) redirect("/dashboard");
  const isAdmin = hasRole(roles, "admin");

  const raw = await searchParams;
  const hasFilters = ["q", "program", "status", "offering"].some((key) => Object.hasOwn(raw, key));
  const parsed = directorySearchSchema.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    program: typeof raw.program === "string" ? raw.program : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    offering: typeof raw.offering === "string" ? raw.offering : undefined,
  });
  const filters: DirectorySearch | null = parsed.success ? parsed.data : hasFilters ? null : {};
  const displayFilters = filters ?? {};
  const supabase = await createClient();
  const [{ rows, error }, reference, assignments] = await Promise.all([
    filters ? listDirectory({ q: filters.q, programId: filters.program, status: filters.status, offeringId: filters.offering }) : Promise.resolve({ rows: [], error: null }),
    listReferenceData(),
    supabase.from("teaching_assignments").select("id, offering:course_offerings(id, section_code, term:academic_terms(name), subject:subjects(code, name))"),
  ]);
  const offeringOptions = (assignments.data ?? []) as unknown as OfferingOption[];
  const currentUrl = rawQueryHref(raw);
  const activeFilters = filters ? [
    ...(filters.q ? [{ key: "q" as const, label: `Search: “${filters.q}”` }] : []),
    ...(filters.program ? [{ key: "program" as const, label: `Program: ${reference.programs.find((program) => program.id === filters.program)?.code ?? "Selected"}` }] : []),
    ...(filters.status ? [{ key: "status" as const, label: `Status: ${filters.status[0].toUpperCase()}${filters.status.slice(1)}` }] : []),
    ...(filters.offering ? [{ key: "offering" as const, label: offeringOptions.find(({ offering }) => offering.id === filters.offering) ? `Offering: ${offeringOptions.find(({ offering }) => offering.id === filters.offering)?.offering.subject.code}` : "Offering (selected)" }] : []),
  ] : [];

  return (
    <AppShell roles={roles} displayName={displayName}>
      <PageHeader
        eyebrow="People"
        title="Student directory"
        description={isAdmin ? "All students (admin scope)." : "Students in your assigned offerings only."}
        actions={isAdmin ? <Link href="/admin/students/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">Create student record</Link> : undefined}
      />

      <Panel title="Filters">
        <form method="get" action="/directory" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(18rem,2fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <label htmlFor="q" className="text-sm font-medium">Search</label>
              <div className="relative mt-1">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="q" name="q" maxLength={120} defaultValue={displayFilters.q ?? (typeof raw.q === "string" ? raw.q : "")} placeholder="Name or registration number" className="min-h-11 w-full rounded-lg border border-input-border py-2 pl-9 pr-3 text-sm sm:min-h-10" />
              </div>
            </div>
            <div>
              <label htmlFor="program" className="text-sm font-medium">Program</label>
              <select id="program" name="program" defaultValue={displayFilters.program ?? (typeof raw.program === "string" ? raw.program : "")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm sm:min-h-10">
                <option value="">Any</option>
                {reference.programs.map((program) => <option key={program.id} value={program.id}>{program.code} — {program.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="status" className="text-sm font-medium">Status</label>
              <select id="status" name="status" defaultValue={displayFilters.status ?? (typeof raw.status === "string" ? raw.status : "")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm sm:min-h-10">
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="graduated">Graduated</option>
              </select>
            </div>
            <div>
              <label htmlFor="offering" className="text-sm font-medium">Offering</label>
              <select id="offering" name="offering" defaultValue={displayFilters.offering ?? (typeof raw.offering === "string" ? raw.offering : "")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border px-3 text-sm sm:min-h-10">
                <option value="">Any</option>
                {offeringOptions.map(({ offering }) => <option key={offering.id} value={offering.id}>{offering.subject.code} — {offering.term.name} — section {offering.section_code}</option>)}
              </select>
            </div>
          </div>
          {reference.error || assignments.error ? <Callout tone="danger" role="alert">Some filter options could not be loaded.</Callout> : null}
          {!parsed.success ? <Callout tone="danger" role="alert">Invalid filters were ignored. Correct them and apply again.</Callout> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text sm:w-auto">Apply filters</button>
            <Link href="/directory" className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium text-primary-text underline-offset-4 hover:underline">Clear filters</Link>
          </div>
        </form>
      </Panel>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-muted-foreground">Filters:</span>
          {activeFilters.map(({ key, label }) => (
            <Link key={key} href={filterHref(filters!, key)} aria-label={`Remove filter ${label}`} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-muted px-3 text-sm hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">
              {label}<span aria-hidden="true">×</span>
            </Link>
          ))}
          <Link href="/directory" className="inline-flex min-h-9 items-center px-2 font-medium text-primary-text underline-offset-4 hover:underline">Clear all</Link>
        </div>
      ) : null}

      {error ? (
        <Callout tone="danger" role="alert">
          Unable to load directory. <Link href={currentUrl} className="font-semibold underline underline-offset-4">Try again</Link>.
        </Callout>
      ) : filters && rows.length === 0 ? (
        activeFilters.length > 0 ? (
          <EmptyState title="No students match these filters" description="Remove a filter or clear all filters to see more students." actions={<Link href="/directory" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-primary-text hover:bg-muted">Clear all filters</Link>} />
        ) : (
          <EmptyState
            title={isAdmin ? "No student records yet" : "No students in your offerings yet"}
            description={isAdmin ? "Link an existing student account to create the first academic record." : "Students appear here when they are enrolled in one of your assigned offerings."}
            actions={isAdmin ? <Link href="/admin/students/new" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Create student record</Link> : undefined}
          />
        )
      ) : !error && rows.length > 0 ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="font-medium">{rows.length} {rows.length === 1 ? "student" : "students"} shown</p>
            <p className="text-muted-foreground">Sorted by registration number</p>
          </div>
          {rows.length === 200 ? <Callout tone="warning">Showing up to 200 matches; more may be available. Narrow your search if the student you need isn&apos;t shown.</Callout> : null}
          <Panel ariaLabel="Directory results" className="overflow-hidden p-0 sm:p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <caption className="sr-only">Student directory results, sorted by registration number</caption>
                <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground"><tr>
                  <th scope="col" className="px-4 py-3">Registration</th>
                  <th scope="col" className="px-4 py-3">Student</th>
                  <th scope="col" className="px-4 py-3">Program</th>
                  <th scope="col" className="hidden px-4 py-3 lg:table-cell">Department</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                </tr></thead>
                <tbody className="divide-y divide-divider">
                  {rows.map((row) => (
                    <tr key={row.student_record_id} className="group relative hover:bg-muted/40 focus-within:z-10 focus-within:ring-2 focus-within:ring-primary-text">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm">{row.registration_number}</td>
                      <td className="px-4 py-3">
                        <Link href={`/directory/${row.student_record_id}`} className="font-semibold text-foreground underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:text-primary-text hover:underline focus-visible:outline-none">
                          {row.display_name}<span className="mt-0.5 block text-sm font-normal text-muted-foreground">{row.contact_email ?? "No contact email"}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><span className="block font-medium">{row.program_code}</span><span className="block text-sm text-muted-foreground">{row.program_name}</span></td>
                      <td className="hidden px-4 py-3 lg:table-cell"><span className="block font-medium">{row.department_code}</span><span className="block text-sm text-muted-foreground">{row.department_name}</span></td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={row.record_status} /></td>
                      <td className="px-4 py-3 text-right text-primary-text" aria-hidden="true">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-divider md:hidden">
              {rows.map((row) => (
                <li key={row.student_record_id}>
                  <Link href={`/directory/${row.student_record_id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-text">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{row.display_name}</span><StatusBadge status={row.record_status} /></span>
                      <span className="mt-1 block font-mono text-sm">{row.registration_number} · {row.program_code} · {row.department_code}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">{row.contact_email ?? "No contact email"}</span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-lg text-primary-text">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </AppShell>
  );
}
