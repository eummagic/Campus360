import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAssignmentDueState } from "@/lib/attendance";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AssignmentForm } from "./assignment-form";
import { EditAssignmentForm } from "./edit-assignment-form";

export const dynamic = "force-dynamic";

type OfferingOption = { id: string; label: string };
type AssignmentRow = {
  id: string;
  offering_id: string;
  title: string;
  instructions: string;
  due_at: string;
  status: "draft" | "published";
  created_by: string;
  offering: { id: string; section_code: string; subject: { code: string; name: string }; term: { name: string } };
};

function formatUtc(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

export default async function AssignmentsPage() {
  const { user, roles, displayName } = await requireUserWithProfile();
  if (!roles.some(({ role }) => role === "admin" || role === "teacher" || role === "student")) redirect("/dashboard");
  const isTeacher = hasRole(roles, "teacher");
  const isStudent = hasRole(roles, "student");
  const isAdmin = hasRole(roles, "admin");
  const supabase = await createClient();
  const [assignmentsResult, teacherAssignmentsResult] = await Promise.all([
    supabase.from("assignments").select("id, offering_id, title, instructions, due_at, status, created_by, offering:course_offerings(id, section_code, subject:subjects(code, name), term:academic_terms(name))").order("due_at").limit(500),
    isTeacher ? supabase.from("teaching_assignments").select("offering:course_offerings(id, section_code, subject:subjects(code, name), term:academic_terms(name))").eq("teacher_user_id", user.id) : Promise.resolve({ data: [], error: null }),
  ]);
  const offerings: OfferingOption[] = (teacherAssignmentsResult.data ?? []).map((row) => {
    const value = row as unknown as { offering: { id: string; section_code: string; subject: { code: string; name: string }; term: { name: string } } };
    return { id: value.offering.id, label: `${value.offering.subject.code} — ${value.offering.subject.name} · ${value.offering.term.name} · section ${value.offering.section_code}` };
  });
  const uniqueOfferings = [...new Map(offerings.map((offering) => [offering.id, offering])).values()];
  const assignments = (assignmentsResult.data ?? []) as unknown as AssignmentRow[];
  const now = new Date();

  return (
    <AppShell roles={roles} displayName={displayName}>
      <PageHeader eyebrow="Coursework" title="Assignments" description={isAdmin && isTeacher ? "Institution-wide read access; you can manage assignments you created for your assigned offerings." : isAdmin ? "Published and draft assignments across the institution. Admin access is read-only." : isTeacher && isStudent ? "Your published coursework and teacher-created assignments for your offerings." : isStudent ? "Published assignments for your enrolled offerings. This phase does not include submissions." : "Assignments for your offerings. Only assignments you created can be edited."} />
      {isTeacher ? (
        <Panel title="Create assignment" description="Due times are entered and displayed in UTC. Publish to make an assignment visible to enrolled students.">
          {teacherAssignmentsResult.error ? <Callout tone="danger" role="alert">Unable to load your assigned offerings.</Callout> : uniqueOfferings.length ? <AssignmentForm offerings={uniqueOfferings} /> : <EmptyState title="No assigned offerings" description="An administrator must assign an offering before you can create an assignment." />}
        </Panel>
      ) : null}
      <Panel title={isTeacher && isAdmin ? "Assignments visible to your roles" : isAdmin ? "Institution assignments" : isTeacher ? "My assignments" : "Available assignments"}>
        {assignmentsResult.error ? <Callout tone="danger" role="alert">Unable to load assignments.</Callout> : assignments.length === 0 ? <EmptyState title="No assignments yet" description={isAdmin ? "Assignments appear here after teachers create them." : "There are no assignments available for your current offerings."} /> : (
          <ul className="divide-y divide-divider">
            {assignments.map((assignment) => {
              const dueState = getAssignmentDueState(assignment.due_at, now);
              return (
                <li key={assignment.id} id={assignment.id} className="py-4 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{assignment.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground"><Link href={`/subjects/${assignment.offering_id}`} className="font-medium text-primary-text underline-offset-4 hover:underline">{assignment.offering.subject.code} · {assignment.offering.subject.name}</Link> · section {assignment.offering.section_code} · {assignment.offering.term.name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={assignment.status} />{assignment.status === "published" ? <StatusBadge status={dueState} /> : null}</div>
                  </div>
                  <p className="mt-2 text-sm">Due {formatUtc(assignment.due_at)}</p>
                  {assignment.instructions ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{assignment.instructions}</p> : null}
                  {isTeacher && assignment.created_by === user.id ? <EditAssignmentForm assignment={{ id: assignment.id, offeringId: assignment.offering_id, title: assignment.title, instructions: assignment.instructions, dueAt: assignment.due_at, status: assignment.status }} offerings={uniqueOfferings} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {assignments.length === 500 ? <Callout tone="warning" className="mt-4">Showing the first 500 assignments. Narrowing by offering is not available yet.</Callout> : null}
      </Panel>
    </AppShell>
  );
}
