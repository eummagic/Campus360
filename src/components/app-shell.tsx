import type { ReactNode } from "react";
import Link from "next/link";
import type { AppRole } from "@/lib/auth";
import { hasRole, isStaff } from "@/lib/auth";

export function AppShell({
  roles,
  displayName,
  children,
}: {
  roles: AppRole[];
  displayName: string;
  children: ReactNode;
}) {
  const staff = isStaff(roles);
  const admin = hasRole(roles, "admin");

  return (
    <div className="min-h-screen">
      <header className="border-b bg-muted/30">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
          <Link href="/dashboard" className="font-semibold">Campus360</Link>
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          {staff ? <Link href="/directory" className="hover:underline">Directory</Link> : null}
          {admin ? <Link href="/admin/academics" className="hover:underline">Academics</Link> : null}
          {admin ? <Link href="/admin/students/new" className="hover:underline">Add Student</Link> : null}
          <Link href="/profile" className="hover:underline">Profile</Link>
          <span className="ml-auto text-muted-foreground">{displayName}</span>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-6">{children}</main>
    </div>
  );
}
