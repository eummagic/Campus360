import { redirect } from "next/navigation";
import Link from "next/link";
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
        <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">← Back to dashboard</Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-primary">Administration</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Academic structure</h1>
        <p className="text-sm text-muted-foreground">Read-only view of the seeded structure. Reference-entity editing is not part of Phase 2A.</p>
      </header>
      {loadError ? <p role="alert" className="rounded-md border border-red-500 p-3 text-sm text-red-600">Unable to load all academic data.</p> : null}
      <section aria-label="Academic reference data" className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-full min-w-0 rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Departments <span className="ml-1 text-sm font-normal text-muted-foreground">({(departments.data ?? []).length})</span></h2><ul className="mt-3 divide-y text-sm">{(departments.data ?? []).map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-1 py-2"><span>{item.code} — {item.name}</span><span className="text-muted-foreground">{item.status}</span></li>)}</ul></div>
        <div className="h-full min-w-0 rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Programs <span className="ml-1 text-sm font-normal text-muted-foreground">({(programs.data ?? []).length})</span></h2><ul className="mt-3 divide-y text-sm">{(programs.data ?? []).map((item) => { const department = (item as unknown as { department?: { code?: string } | null }).department; return <li key={item.id} className="py-2"><span className="font-medium">{item.code}</span> — {item.name}<span className="block text-xs text-muted-foreground">{department?.code ?? "—"} · {item.status}</span></li>; })}</ul></div>
        <div className="h-full min-w-0 rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Terms <span className="ml-1 text-sm font-normal text-muted-foreground">({(terms.data ?? []).length})</span></h2><ul className="mt-3 divide-y text-sm">{(terms.data ?? []).map((item) => <li key={item.id} className="py-2"><span className="font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.status} · {item.starts_on ?? "?"} → {item.ends_on ?? "?"}</span></li>)}</ul></div>
        <div className="h-full min-w-0 rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Subjects <span className="ml-1 text-sm font-normal text-muted-foreground">({(subjects.data ?? []).length})</span></h2><ul className="mt-3 divide-y text-sm">{(subjects.data ?? []).map((item) => { const program = (item as unknown as { program?: { code?: string } | null }).program; return <li key={item.id} className="py-2"><span className="font-medium">{item.code}</span> — {item.name}<span className="block text-xs text-muted-foreground">{program?.code ?? "—"} · {item.credits ?? "—"} credits · {item.status}</span></li>; })}</ul></div>
        <div className="h-full min-w-0 rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Offerings <span className="ml-1 text-sm font-normal text-muted-foreground">({(offerings.data ?? []).length})</span></h2><ul className="mt-3 divide-y text-sm">{(offerings.data ?? []).map((item) => { const related = item as unknown as { id: string; section_code: string; subject?: { code?: string } | null; term?: { name?: string } | null }; return <li key={item.id} className="py-2"><span className="font-medium">{related.subject?.code ?? "?"} · section {item.section_code}</span><span className="block text-xs text-muted-foreground">{related.term?.name ?? "?"} · {item.status}</span></li>; })}</ul></div>
        <div className="h-full min-w-0 rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Teaching assignments <span className="ml-1 text-sm font-normal text-muted-foreground">({(assignments.data ?? []).length})</span></h2><ul className="mt-3 divide-y text-sm">{(assignments.data ?? []).length === 0 ? <li className="py-2 text-muted-foreground">None.</li> : (assignments.data ?? []).map((item) => { const related = item as unknown as { id: string; teacher_user_id: string; offering?: { section_code?: string; subject?: { code?: string } | null } | null }; return <li key={item.id} className="py-2"><span className="font-medium">{related.offering?.subject?.code ?? "?"} · section {related.offering?.section_code ?? "?"}</span><span className="block text-xs text-muted-foreground">Teacher {related.teacher_user_id.slice(0, 8)}…</span></li>; })}</ul></div>
      </section>
    </AppShell>
  );
}
