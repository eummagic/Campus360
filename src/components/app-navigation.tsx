"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  GraduationCap,
  LayoutDashboard,
  Menu,
  UserPlus,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };

export function AppNavigation({
  isStaff,
  isAdmin,
  displayName,
  initialTheme,
  accountAction,
}: {
  isStaff: boolean;
  isAdmin: boolean;
  displayName: string;
  initialTheme: "dark" | "light";
  accountAction: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLElement>(null);
  const wasMobileOpenRef = useRef(false);
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const sections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "Workspace",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (path) => path === "/dashboard" },
        ...(isStaff ? [{ href: "/directory", label: "Student Directory", icon: UsersRound, match: (path: string) => path.startsWith("/directory") }] : []),
      ],
    },
    {
      title: "Academics",
      items: isAdmin
        ? [
            { href: "/admin/academics", label: "Academic Structure", icon: BookOpenCheck, match: (path) => path.startsWith("/admin/academics") },
            { href: "/admin/students/new", label: "Create Student Record", icon: UserPlus, match: (path) => path.startsWith("/admin/students") },
          ]
        : [],
    },
    {
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: UserRound, match: (path) => path === "/profile" }],
    },
  ];

  useEffect(() => {
    if (!mobileOpen) {
      if (wasMobileOpenRef.current) menuButtonRef.current?.focus();
      wasMobileOpenRef.current = false;
      return;
    }
    wasMobileOpenRef.current = true;
    closeButtonRef.current?.focus();
    function handleMenuKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = mobilePanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleMenuKeys);
    return () => window.removeEventListener("keydown", handleMenuKeys);
  }, [mobileOpen]);

  function closeMobileNavigation() {
    setMobileOpen(false);
  }

  function renderNavigation(onNavigate?: () => void): ReactNode {
    return sections.filter((section) => section.items.length > 0).map((section) => (
      <div key={section.title} className="mb-6">
        <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{section.title}</h2>
        <ul className="space-y-1">
          {section.items.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {active ? <span className="ml-auto size-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ));
  }

  function accountFooter() {
    return (
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 px-2 pb-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{initials}</span>
          <span className="min-w-0 truncate text-sm font-medium text-foreground" title={displayName}>{displayName}</span>
        </div>
        <ThemeToggle initialTheme={initialTheme} />
        <div className="mt-1">{accountAction}</div>
      </div>
    );
  }

  return (
    <>
      <aside className="sticky top-0 z-30 hidden h-screen w-64 flex-col border-r border-border bg-sidebar lg:flex">
        <Link href="/dashboard" className="flex h-[76px] items-center gap-3 border-b border-border px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><GraduationCap aria-hidden="true" className="size-5" /></span>
          <span className="text-base font-bold tracking-tight text-foreground">Campus<span className="text-primary">360</span></span>
        </Link>
        <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-6">{renderNavigation()}</nav>
        {accountFooter()}
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-sidebar px-4 lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
          <GraduationCap aria-hidden="true" className="size-5 text-primary" /> Campus360
        </Link>
        <ThemeToggle initialTheme={initialTheme} compact />
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation menu" onClick={closeMobileNavigation} className="absolute inset-0 size-full cursor-default bg-black/60" />
          <aside ref={mobilePanelRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Main navigation" className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-border bg-sidebar shadow-2xl">
            <div className="flex h-[76px] items-center justify-between border-b border-border px-5">
              <Link href="/dashboard" onClick={closeMobileNavigation} className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><GraduationCap aria-hidden="true" className="size-5" /></span>
                <span>Campus<span className="text-primary">360</span></span>
              </Link>
              <button ref={closeButtonRef} type="button" aria-label="Close navigation menu" onClick={closeMobileNavigation} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X aria-hidden="true" className="size-5" /></button>
            </div>
            <nav aria-label="Mobile navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-6">{renderNavigation(closeMobileNavigation)}</nav>
            {accountFooter()}
          </aside>
        </div>
      ) : null}
    </>
  );
}
