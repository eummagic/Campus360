import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = {
  role: "student" | "teacher" | "admin" | "driver" | "finance";
  scope: string | null;
};

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
}

export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, scope")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Unable to load roles");
  }

  return (data ?? []) as AppRole[];
}