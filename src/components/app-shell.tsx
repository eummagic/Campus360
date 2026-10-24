import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { hasRole, isStaff, type AppRole } from "@/lib/auth";
import { AppNavigation } from "@/components/app-navigation";
import { signOut } from "@/app/profile/actions";

export async function AppShell({
  roles,
  displayName,
  children,
}: {
  roles: AppRole[];
  displayName: string;
  children: ReactNode;
}) {
  const initialTheme = (await cookies()).get("campus360-theme")?.value === "light" ? "light" : "dark";
  const staff = isStaff(roles);
  const admin = hasRole(roles, "admin");

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <AppNavigation
        isStaff={staff}
        isAdmin={admin}
        displayName={displayName}
        initialTheme={initialTheme}
        accountAction={
          <form action={signOut}>
            <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Sign out
            </button>
          </form>
        }
      />
      <main className="w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
    </div>
  );
}
