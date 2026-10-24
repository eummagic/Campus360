import type { ReactNode } from "react";

const toneClasses = {
  info: "border-info/40 bg-info-soft text-info",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  danger: "border-danger/40 bg-danger-soft text-danger",
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  role,
  className = "",
}: {
  tone?: keyof typeof toneClasses;
  title?: ReactNode;
  children: ReactNode;
  role?: "status" | "alert" | "note";
  className?: string;
}) {
  return (
    <div role={role} className={`rounded-lg border px-4 py-3 text-sm ${toneClasses[tone]} ${className}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
