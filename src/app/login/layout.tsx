import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const initialTheme = (await cookies()).get("campus360-theme")?.value === "light" ? "light" : "dark";

  return (
    <>
      <div className="fixed right-4 top-4 z-10"><ThemeToggle initialTheme={initialTheme} compact /></div>
      {children}
    </>
  );
}
