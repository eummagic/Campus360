"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createStudentRecordSchema } from "@/lib/validation/academic";

export type CreateStudentResult = { ok: true } | { ok: false; message: string };
type UnlinkedStudent = { user_id: string; display_name: string; contact_email: string | null };

export async function createStudentRecord(
  _previous: CreateStudentResult | null,
  formData: FormData,
): Promise<CreateStudentResult> {
  const { roles } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) return { ok: false, message: "Not authorized." };

  const parsed = createStudentRecordSchema.safeParse({
    userId: formData.get("userId"),
    registrationNumber: formData.get("registrationNumber"),
    programId: formData.get("programId"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  // Recheck the submitted identity against the admin-only candidate RPC. This
  // prevents crafted Server Action requests from linking arbitrary accounts.
  const { data: candidates, error: candidateError } = await supabase.rpc("list_unlinked_student_users");
  const unlinkedStudents = (candidates ?? []) as UnlinkedStudent[];
  if (candidateError || !unlinkedStudents.some((candidate) => candidate.user_id === parsed.data.userId)) {
    return { ok: false, message: "Select an eligible, unlinked student account." };
  }

  const { error } = await supabase.from("student_records").insert({
    user_id: parsed.data.userId,
    registration_number: parsed.data.registrationNumber,
    program_id: parsed.data.programId,
  });
  if (error) return { ok: false, message: "Could not create student record." };

  revalidatePath("/admin/students/new");
  revalidatePath("/directory");
  revalidatePath("/dashboard");
  return { ok: true };
}
