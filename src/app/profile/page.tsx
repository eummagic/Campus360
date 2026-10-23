import { requireUser, getUserRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, contact_email, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-4 text-sm text-red-600" role="alert">
          Unable to load your profile. If this persists, contact an
          administrator.
        </p>
      </main>
    );
  }

  const roles = await getUserRoles(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <header>
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.contact_email ?? "No contact email"}
        </p>
      </header>

      <section aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="text-lg font-medium">
          Roles
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {roles.length === 0 ? (
            <li className="text-muted-foreground">No roles assigned.</li>
          ) : (
            roles.map((r) => (
              <li key={`${r.role}-${r.scope ?? "global"}`}>
                {r.role}
                {r.scope ? ` — ${r.scope}` : ""}
              </li>
            ))
          )}
        </ul>
      </section>

      <ProfileForm initialDisplayName={profile.display_name} />
    </main>
  );
}