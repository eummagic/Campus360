const statusClasses: Record<string, string> = {
  active: "bg-success-soft text-success",
  present: "bg-success-soft text-success",
  published: "bg-success-soft text-success",
  graduated: "bg-info-soft text-info",
  upcoming: "bg-info-soft text-info",
  inactive: "bg-neutral-soft text-neutral",
  archived: "bg-neutral-soft text-neutral",
  closed: "bg-neutral-soft text-neutral",
  planned: "bg-neutral-soft text-neutral",
  pending: "bg-warning-soft text-warning",
  late: "bg-warning-soft text-warning",
  "due-soon": "bg-warning-soft text-warning",
  absent: "bg-danger-soft text-danger",
  "past-due": "bg-danger-soft text-danger",
  draft: "bg-neutral-soft text-neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  const label = normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Unknown";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ${statusClasses[normalized] ?? "bg-neutral-soft text-neutral"}`}>
      {label}
    </span>
  );
}
