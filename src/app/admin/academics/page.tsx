import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminAcademicsPage() {
  const { roles, displayName } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) redirect("/dashboard");

  const supabase = await createClient();
  const [departments, programs, terms, subjects, offerings, assignments] = await Promise.all([
    supabase.from("departments").select("id, code, name, status").order("code"),
    supabase.from("programs").select("id, code, name, status, department:departments(code)").order("code"),
    supabase.from("academic_terms").select("id, name, status, starts_on, ends_on").order("name"),
    supabase.from("subjects").select("id, code, name, credits, status, program:programs(code)").order("code"),
    supabase.from("course_offerings").select("id, section_code, status, term:academic_terms(name), subject:subjects(code, name)").order("section_code"),
    supabase.from("teaching_assignments").select("id, teacher_user_id, offering:course_offerings(section_code, subject:subjects(code))"),
  ]);
  const loadError = departments.error ?? programs.error ?? terms.error ?? subjects.error ?? offerings.error ?? assignments.error;

  return (
    <AppShell roles={roles} displayName={displayName}>
      <header>
        <h1 className="text-2xl font-semibold">Academic structure</h1>
        <p className="text-sm text-muted-foreground">Read-only view of the seeded structure. Reference-entity editing is not part of Phase 2A.</p>
      </header>
      {loadError ? <p role="alert" className="rounded-md border border-red-500 p-3 text-sm text-red-600">Unable to load all academic data.</p> : null}
      <section className="space-y-6">
        <div className="rounded-lg border p-4"><h2 className="text-lg font-medium">Departments</h2><ul className="mt-2 text-sm">{(departments.data ?? []).map((item) => <li key={item.id}>{item.code} — {item.name} ({item.status})</li>)}</ul></div>
        <div className="rounded-lg border p-4"><h2 className="text-lg font-medium">Programs</h2><ul className="mt-2 text-sm">{(programs.data ?? []).map((item) => { const department = (item as unknown as { department?: { code?: string } | null }).department; return <li key={item.id}>{item.code} — {item.name} ({department?.code ?? "—"})</li>; })}</ul></div>
        <div className="rounded-lg border p-4"><h2 className="text-lg font-medium">Terms</h2><ul className="mt-2 text-sm">{(terms.data ?? []).map((item) => <li key={item.id}>{item.name} — {item.status} ({item.starts_on ?? "?"} → {item.ends_on ?? "?"})</li>)}</ul></div>
        <div className="rounded-lg border p-4"><h2 className="text-lg font-medium">Subjects</h2><ul className="mt-2 text-sm">{(subjects.data ?? []).map((item) => { const program = (item as unknown as { program?: { code?: string } | null }).program; return <li key={item.id}>{item.code} — {item.name} ({program?.code ?? "—"})</li>; })}</ul></div>
        <div className="rounded-lg border p-4"><h2 className="text-lg font-medium">Offerings</h2><ul className="mt-2 text-sm">{(offerings.data ?? []).map((item) => { const related = item as unknown as { id: string; section_code: string; subject?: { code?: string } | null; term?: { name?: string } | null }; return <li key={item.id}>{related.subject?.code ?? "?"} — section {item.section_code} — {related.term?.name ?? "?"} ({item.status})</li>; })}</ul></div>
        <div className="rounded-lg border p-4"><h2 className="text-lg font-medium">Teaching assignments</h2><ul className="mt-2 text-sm">{(assignments.data ?? []).length === 0 ? <li className="text-muted-foreground">None.</li> : (assignments.data ?? []).map((item) => { const related = item as unknown as { id: string; teacher_user_id: string; offering?: { section_code?: string; subject?: { code?: string } | null } | null }; return <li key={item.id}>{related.teacher_user_id.slice(0, 8)}… → {related.offering?.subject?.code ?? "?"} section {related.offering?.section_code ?? "?"}</li>; })}</ul></div>
      </section>
    </AppShell>
  );
}
