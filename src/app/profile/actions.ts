"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/instance";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/data/core";
import { updateMyDisplayName } from "@/lib/data/campus";
import { updateProfileSchema } from "@/lib/validation/profile";

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateDisplayName(
  _previous: UpdateProfileResult | null,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const user = await requireUser();

  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid display name." };
  }

  const result = await updateMyDisplayName(await getAccess(user.id), parsed.data.displayName);
  if (!result.ok) {
    return { ok: false, message: "Could not save your display name. Please try again." };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function signOut() {
  await requireUser();
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
