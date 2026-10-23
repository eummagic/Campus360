"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/lib/validation/profile";

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateDisplayName(
  _previous: UpdateProfileResult | null,
  formData: FormData,
): Promise<UpdateProfileResult> {
  await requireUser();

  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid display name." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_display_name", {
    p_display_name: parsed.data.displayName,
  });
  if (error) {
    return { ok: false, message: "Could not save your display name. Please try again." };
  }

  revalidatePath("/profile");
  return { ok: true };
}
