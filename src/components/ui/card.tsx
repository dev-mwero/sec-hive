import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A panel, not a floating card. Hairline border, tight radius, almost no shadow — the surface
 * belongs to the console rather than floating above it.
 */
const cardVariants = cva("rounded-lg bg-surface text-foreground", {
  variants: {
    inset: {
      true: "bg-surface-inset",
      false: "",
    },
    interactive: {
      true: "border border-border-base transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      false: "border border-border-base",
    },
  },
  defaultVariants: { inset: false, interactive: false },
});

export type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants>;

export function Card({ className, inset, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ inset, interactive }), className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border-base px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("label-block text-foreground-muted", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-xs text-foreground-subtle", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-border-base px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export { cardVariants };
