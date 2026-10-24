"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assignmentSchema, updateAssignmentSchema } from "@/lib/validation/campus";

export type AssignmentActionResult = { ok: true } | { ok: false; message: string };

function readAssignmentForm(formData: FormData) {
  return {
    offeringId: formData.get("offeringId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    dueAt: formData.get("dueAt"),
    status: formData.get("status"),
  };
}

export async function createAssignment(_previous: AssignmentActionResult | null, formData: FormData): Promise<AssignmentActionResult> {
  const { user, roles } = await requireUserWithProfile();
  if (!hasRole(roles, "teacher")) return { ok: false, message: "Only assigned teachers can create assignments." };
  const parsed = assignmentSchema.safeParse(readAssignmentForm(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the assignment details." };

  const supabase = await createClient();
  const { error } = await supabase.from("assignments").insert({
    offering_id: parsed.data.offeringId,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    due_at: new Date(`${parsed.data.dueAt}:00Z`).toISOString(),
    status: parsed.data.status,
    created_by: user.id,
  });
  if (error) return { ok: false, message: "Could not create the assignment for that offering." };

  revalidatePath("/assignments");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAssignment(_previous: AssignmentActionResult | null, formData: FormData): Promise<AssignmentActionResult> {
  const { roles } = await requireUserWithProfile();
  if (!hasRole(roles, "teacher")) return { ok: false, message: "Only assigned teachers can edit assignments." };
  const parsed = updateAssignmentSchema.safeParse({ ...readAssignmentForm(formData), assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the assignment details." };

  const supabase = await createClient();
  const { error } = await supabase.from("assignments").update({
    offering_id: parsed.data.offeringId,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    due_at: new Date(`${parsed.data.dueAt}:00Z`).toISOString(),
    status: parsed.data.status,
  }).eq("id", parsed.data.assignmentId);
  if (error) return { ok: false, message: "Could not update the assignment." };

  revalidatePath("/assignments");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}
