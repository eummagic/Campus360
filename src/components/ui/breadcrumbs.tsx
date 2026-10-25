import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true" className="text-muted-foreground">/</span> : null}
              {current || !item.href ? (
                <span aria-current={current ? "page" : undefined} className={current ? "font-medium text-foreground" : "text-muted-foreground"}>{item.label}</span>
              ) : (
                <Link href={item.href} className="text-primary-text underline-offset-4 hover:underline">{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
