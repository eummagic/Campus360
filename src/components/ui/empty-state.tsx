import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center sm:px-8">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
