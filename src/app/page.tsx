import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkipLink } from "@/components/ui/skip-link";

export default async function HomePage() {
  const initialTheme = (await cookies()).get("campus360-theme")?.value === "light" ? "light" : "dark";

  return (
    <>
    <SkipLink />
    <main id="main-content" tabIndex={-1} className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16 outline-none sm:px-8">
      <div className="absolute right-4 top-4 z-10 sm:right-8 sm:top-8"><ThemeToggle initialTheme={initialTheme} compact /></div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background" />
      <div className="relative w-full max-w-4xl rounded-3xl border bg-card/90 p-8 shadow-xl shadow-primary/5 backdrop-blur sm:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-text">Campus360</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Your campus, in focus.
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          A clear view of your academic information, student records, and campus directory.
        </p>
        <p className="mt-5 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Phase 2A · Synthetic data only</p>
      </div>
      <div className="relative mt-8 flex w-full max-w-4xl flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border bg-card px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
        >
          Dashboard
        </Link>
      </div>
    </main>
    </>
  );
}
