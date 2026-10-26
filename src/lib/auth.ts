import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth/instance";
import { getDb } from "@/lib/mongo/connection";

export type AppRole = {
  role: "student" | "teacher" | "admin" | "driver" | "finance";
  scope: string | null;
};

export type SessionUser = { id: string; email: string | null };

async function readSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await readSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function getOptionalUser(): Promise<SessionUser | null> {
  return readSessionUser();
}

export async function getUserRoles(userId: string): Promise<AppRole[]> {
  if (!ObjectId.isValid(userId)) return [];
  const rows = await getDb()
    .collection("user_roles")
    .find({ user_id: new ObjectId(userId) }, { projection: { _id: 0, role: 1, scope: 1 } })
    .toArray();
  return rows.map((row) => ({ role: row.role, scope: row.scope ?? null })) as AppRole[];
}

export type UserContext = {
  user: { id: string; email?: string | null };
  roles: AppRole[];
  displayName: string;
};

export async function requireUserWithProfile(): Promise<UserContext> {
  const user = await requireUser();
  const [roles, profile] = await Promise.all([
    getUserRoles(user.id),
    getDb().collection("profiles").findOne({ _id: new ObjectId(user.id) }, { projection: { display_name: 1 } }),
  ]);
  return {
    user,
    roles,
    displayName: (profile?.display_name as string | undefined) ?? user.email ?? "User",
  };
}

export function hasRole(roles: AppRole[], role: AppRole["role"]): boolean {
  return roles.some((entry) => entry.role === role);
}

export function isStaff(roles: AppRole[]): boolean {
  return hasRole(roles, "teacher") || hasRole(roles, "admin");
}
