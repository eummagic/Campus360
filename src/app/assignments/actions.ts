"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { getAccess } from "@/lib/data/core";
import { createAssignment as insertAssignment, updateAssignment as saveAssignment } from "@/lib/data/campus";
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

  const result = await insertAssignment(await getAccess(user.id), {
    offeringId: parsed.data.offeringId,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    dueAt: new Date(`${parsed.data.dueAt}:00Z`),
    status: parsed.data.status,
  });
  if (!result.ok) return { ok: false, message: "Could not create the assignment for that offering." };

  revalidatePath("/assignments");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAssignment(_previous: AssignmentActionResult | null, formData: FormData): Promise<AssignmentActionResult> {
  const { user, roles } = await requireUserWithProfile();
  if (!hasRole(roles, "teacher")) return { ok: false, message: "Only assigned teachers can edit assignments." };
  const parsed = updateAssignmentSchema.safeParse({ ...readAssignmentForm(formData), assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the assignment details." };

  const result = await saveAssignment(await getAccess(user.id), {
    assignmentId: parsed.data.assignmentId,
    offeringId: parsed.data.offeringId,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    dueAt: new Date(`${parsed.data.dueAt}:00Z`),
    status: parsed.data.status,
  });
  if (!result.ok) return { ok: false, message: "Could not update the assignment." };

  revalidatePath("/assignments");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}
