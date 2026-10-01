import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border font-narrow text-2xs font-semibold uppercase tracking-[0.1em]",
  {
    variants: {
      variant: {
        default: "border-border-base bg-surface-raised text-foreground-muted",
        accent: "border-accent/25 bg-accent-subtle text-accent",
        covered: "border-covered/25 bg-covered-subtle text-covered",
        attention: "border-attention/25 bg-attention-subtle text-attention",
        critical: "border-critical/25 bg-critical-subtle text-critical",
        neutral:
          "border-neutral-signal/25 bg-neutral-subtle text-neutral-signal",
        outline: "border-border-strong bg-transparent text-foreground-muted",
      },
      size: {
        sm: "px-1.5 py-0.5",
        md: "px-2 py-0.5",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
