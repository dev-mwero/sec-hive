import { cn } from "@/lib/utils";

/**
 * Table primitives for the duty roster.
 *
 * The roster is the product's core document, so the table gets real attention: a sticky header
 * (you scroll a long list while needing the column names), a left status rule, hairline row
 * separators instead of zebra striping (stripes fight with the status colours), and mono tabular
 * figures in every numeric cell.
 */
export function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", containerClassName)}>
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-10", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.ComponentProps<"tbody">) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableRow({
  className,
  statusRule,
  ...props
}: React.ComponentProps<"tr"> & { statusRule?: string | undefined }) {
  return (
    <tr
      className={cn(
        "border-b border-border-base transition-colors last:border-b-0 hover:bg-surface-raised/60",
        className,
      )}
      {...props}
    >
      {statusRule ? (
        <td className="w-[3px] p-0" aria-hidden>
          <span className={cn("block h-full min-h-9 w-full", statusRule)} />
        </td>
      ) : null}
      {props.children}
    </tr>
  );
}

export function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "label-block border-b border-border-strong bg-surface px-3 py-2 text-left font-semibold whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-foreground-muted",
        numeric && "text-right font-mono text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableEmpty({
  colSpan,
  title,
  description,
  action,
}: {
  colSpan: number;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-14 text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-foreground-subtle">
          {description}
        </p>
        {action ? (
          <div className="mt-4 flex justify-center">{action}</div>
        ) : null}
      </td>
    </tr>
  );
}
