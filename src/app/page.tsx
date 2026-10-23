import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-8">
      <div>
        <p className="text-sm font-medium text-primary">Campus360</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Phase 1 foundation
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Protected profile read path and controlled audit-backed mutation.
          Synthetic data only.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </Link>
        <Link
          href="/profile"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Profile
        </Link>
      </div>
    </main>
  );
}