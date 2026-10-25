import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { hasRole, isStaff, type AppRole } from "@/lib/auth";
import { AppNavigation } from "@/components/app-navigation";
import { signOut } from "@/app/profile/actions";
import { LogOut } from "lucide-react";
import { SkipLink } from "@/components/ui/skip-link";
import { CampusAssistant } from "@/components/campus-assistant";

const roleLabels: Record<AppRole["role"], string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Administrator",
  driver: "Driver",
  finance: "Finance",
};

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
  const canUseCampusFeatures = roles.some(({ role }) => role === "admin" || role === "teacher" || role === "student");
  const visibleRoleLabels = [...new Set(roles.map(({ role }) => roleLabels[role]))];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink />
      <AppNavigation
        isStaff={staff}
        isAdmin={admin}
        canUseCampusFeatures={canUseCampusFeatures}
        displayName={displayName}
        initialTheme={initialTheme}
        roleLabels={visibleRoleLabels}
        accountAction={
          <form action={signOut}>
            <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">
              <LogOut aria-hidden="true" className="size-4" />
              <span>Sign out</span>
            </button>
          </form>
        }
      />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1280px] min-w-0 space-y-6 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <CampusAssistant roles={roles.map(({ role }) => role)} />
    </div>
  );
}
