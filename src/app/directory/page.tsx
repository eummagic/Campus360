import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isStaff, requireUserWithProfile } from "@/lib/auth";
import { listDirectory, listReferenceData } from "@/lib/academics";
import { createClient } from "@/lib/supabase/server";
import { directorySearchSchema } from "@/lib/validation/academic";

export const dynamic = "force-dynamic";

type OfferingOption = {
  offering: {
    id: string;
    section_code: string;
    term: { name: string };
    subject: { code: string; name: string };
  };
};

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roles, displayName } = await requireUserWithProfile();
  if (!isStaff(roles)) redirect("/dashboard");

  const raw = await searchParams;
  const hasFilters = ["q", "program", "status", "offering"].some((key) => Object.hasOwn(raw, key));
  const parsed = directorySearchSchema.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    program: typeof raw.program === "string" ? raw.program : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    offering: typeof raw.offering === "string" ? raw.offering : undefined,
  });
  const filters = parsed.success ? parsed.data : hasFilters ? null : {};
  const displayFilters = filters ?? {};
  const supabase = await createClient();
  const [{ rows, error }, reference, assignments] = await Promise.all([
    filters ? listDirectory({ q: filters.q, programId: filters.program, status: filters.status, offeringId: filters.offering }) : Promise.resolve({ rows: [], error: null }),
    listReferenceData(),
    supabase.from("teaching_assignments").select("id, offering:course_offerings(id, section_code, term:academic_terms(name), subject:subjects(code, name))"),
  ]);
  const offeringOptions = (assignments.data ?? []) as unknown as OfferingOption[];

  return (
    <AppShell roles={roles} displayName={displayName}>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">People</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Student directory</h1>
        <p className="text-sm text-muted-foreground">
          {roles.some((role) => role.role === "admin") ? "All students (admin scope)." : "Students in your assigned offerings only."}
        </p>
      </header>

      <form method="get" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="q" className="text-sm font-medium">Search</label>
            <input id="q" name="q" maxLength={120} defaultValue={displayFilters.q ?? (typeof raw.q === "string" ? raw.q : "")} placeholder="Name or registration number" className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm" />
          </div>
          <div>
            <label htmlFor="program" className="text-sm font-medium">Program</label>
            <select id="program" name="program" defaultValue={displayFilters.program ?? (typeof raw.program === "string" ? raw.program : "")} className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm">
              <option value="">Any</option>
              {reference.programs.map((program) => <option key={program.id} value={program.id}>{program.code} — {program.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="text-sm font-medium">Status</label>
            <select id="status" name="status" defaultValue={displayFilters.status ?? (typeof raw.status === "string" ? raw.status : "")} className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm">
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>
          <div>
            <label htmlFor="offering" className="text-sm font-medium">Offering</label>
            <select id="offering" name="offering" defaultValue={displayFilters.offering ?? (typeof raw.offering === "string" ? raw.offering : "")} className="mt-1 w-full rounded-md border px-3 py-2 shadow-sm">
              <option value="">Any</option>
              {offeringOptions.map(({ offering }) => <option key={offering.id} value={offering.id}>{offering.subject.code} — {offering.term.name} — section {offering.section_code}</option>)}
            </select>
          </div>
        </div>
        {reference.error || assignments.error ? <p role="alert" className="text-sm text-red-600">Some filter options could not be loaded.</p> : null}
        {!parsed.success ? <p role="alert" className="text-sm text-red-600">Invalid filters were ignored. Correct them and apply again.</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">Apply filters</button>
          <Link href="/directory" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Clear filters</Link>
        </div>
      </form>

      {error ? <p role="alert" className="rounded-md border border-red-500 p-3 text-sm text-red-600">Unable to load directory. Please try again.</p> : null}
      {!error && filters && rows.length === 0 ? <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center"><p className="font-medium">No students found</p><p className="mt-1 text-sm text-muted-foreground">Try changing your search or filters.</p><Link href="/directory" className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Clear all filters</Link></div> : null}
      {!error && rows.length > 0 ? (
        <section aria-label="Directory results" className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "student" : "students"} found</div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>
              <th className="px-3 py-2">Registration</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Program</th><th className="px-3 py-2">Department</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"><span className="sr-only">Action</span></th>
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.student_record_id} className="border-t transition-colors hover:bg-muted/30">
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.registration_number}</td><td className="whitespace-nowrap px-3 py-3 font-medium">{row.display_name}</td><td className="whitespace-nowrap px-3 py-3">{row.program_code} — {row.program_name}</td><td className="whitespace-nowrap px-3 py-3">{row.department_code}</td><td className="px-3 py-3"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium capitalize text-primary">{row.record_status}</span></td>
              <td className="whitespace-nowrap px-3 py-3"><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/directory/${row.student_record_id}`}>View profile <span aria-hidden="true">→</span></Link></td>
            </tr>)}</tbody>
          </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
