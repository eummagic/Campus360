import { requireUser, getUserRoles } from "@/lib/auth";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getAccess } from "@/lib/data/core";
import { getOwnProfile } from "@/lib/data/campus";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const { data: profile, error } = await getOwnProfile(await getAccess(user.id));

  if (error || !profile) {
    const roles = await getUserRoles(user.id);
    return (
      <AppShell roles={roles} displayName={user.email ?? "User"}>
      <div className="w-full max-w-3xl space-y-4">
        <Link href="/dashboard" className="text-sm font-medium text-primary-text underline-offset-4 hover:underline">← Back to dashboard</Link>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="rounded-xl border border-danger bg-card p-4 text-sm text-danger" role="alert">
          Unable to load your profile. If this persists, contact an
          administrator.
        </p>
      </div>
      </AppShell>
    );
  }

  const roles = await getUserRoles(user.id);

  return (
    <AppShell roles={roles} displayName={profile.display_name}>
      <div className="w-full max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-text">Account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Your profile</h1>
        <p className="mt-2 text-muted-foreground">Manage your account details and view your assigned roles.</p>
      </header>

      <section aria-labelledby="account-heading" className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 id="account-heading" className="text-lg font-semibold">Account details</h2>
        <p className="mt-1 text-sm text-muted-foreground">{profile.contact_email ?? "No contact email"}</p>
      </section>

      <section aria-labelledby="roles-heading" className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 id="roles-heading" className="text-lg font-semibold">Roles</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {roles.length === 0 ? (
            <li className="text-muted-foreground">No roles assigned.</li>
          ) : (
            roles.map((r) => (
              <li key={`${r.role}-${r.scope ?? "global"}`} className="rounded-full bg-neutral-soft px-3 py-1 font-medium capitalize text-neutral">
                {r.role}{r.scope ? ` — ${r.scope}` : ""}
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="rounded-xl border bg-card p-5 shadow-sm"><ProfileForm initialDisplayName={profile.display_name} /></div>
      </div>
    </AppShell>
  );
}
