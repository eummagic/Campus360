import { useId, type ReactNode } from "react";

export function Panel({
  title,
  description,
  actions,
  footer,
  children,
  className = "",
  id,
  ariaLabel,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const generatedId = useId();
  const headingId = title ? `${id ?? generatedId}-heading` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      aria-label={ariaLabel}
      className={`min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none sm:p-5 ${className}`}
    >
      {title || description || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 id={headingId} className="text-base font-semibold leading-6">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="mt-4 border-t border-divider pt-3 text-sm text-muted-foreground">{footer}</div> : null}
    </section>
  );
}
