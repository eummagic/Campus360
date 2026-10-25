export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only fixed left-3 top-3 z-[100] rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
    >
      Skip to main content
    </a>
  );
}
