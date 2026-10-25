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

export async function getOptionalUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export type UserContext = {
  user: { id: string; email?: string | null };
  roles: AppRole[];
  displayName: string;
};

export async function requireUserWithProfile(): Promise<UserContext> {
  const user = await requireUser();
  const [roles, supabase] = await Promise.all([
    getUserRoles(user.id),
    createClient(),
  ]);
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    roles,
    displayName: profile?.display_name ?? user.email ?? "User",
  };
}

export function hasRole(roles: AppRole[], role: AppRole["role"]): boolean {
  return roles.some((entry) => entry.role === role);
}

export function isStaff(roles: AppRole[]): boolean {
  return hasRole(roles, "teacher") || hasRole(roles, "admin");
}
