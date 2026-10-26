"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { getAccess } from "@/lib/data/core";
import { createStudentRecord as insertStudentRecord } from "@/lib/data/campus";
import { createStudentRecordSchema } from "@/lib/validation/academic";

export type CreateStudentResult = { ok: true } | { ok: false; message: string };

export async function createStudentRecord(
  _previous: CreateStudentResult | null,
  formData: FormData,
): Promise<CreateStudentResult> {
  const { user, roles } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) return { ok: false, message: "Not authorized." };

  const parsed = createStudentRecordSchema.safeParse({
    userId: formData.get("userId"),
    registrationNumber: formData.get("registrationNumber"),
    programId: formData.get("programId"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // The data layer re-checks admin role, student role, and "not yet linked"
  // inside a transaction, so crafted Server Action requests cannot link
  // arbitrary or already-linked accounts.
  const result = await insertStudentRecord(await getAccess(user.id), parsed.data);
  if (!result.ok) return { ok: false, message: "Select an eligible, unlinked student account." };

  revalidatePath("/admin/students/new");
  revalidatePath("/directory");
  revalidatePath("/dashboard");
  return { ok: true };
}
