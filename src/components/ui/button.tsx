import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Tight radii and no gratuitous shadow: this is equipment, not a consumer app. Every variant
 * carries an explicit focus ring rather than relying on the global outline.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: amber. One accent action per view.
        primary:
          "bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-hover",
        // Secondary: the quiet default for most actions.
        secondary:
          "bg-surface-raised text-foreground border border-border-base hover:border-border-strong hover:bg-surface-inset",
        outline:
          "border border-border-base bg-transparent text-foreground hover:bg-surface-raised",
        ghost:
          "text-foreground-muted hover:bg-surface-raised hover:text-foreground",
        // Destructive uses the critical signal so it never reads as an accent action.
        destructive:
          "bg-critical text-white hover:bg-critical/90 active:bg-critical",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        // Guards check in from a phone — 44px minimum touch target.
        sm: "h-8 px-2.5 text-xs [&_svg]:size-3.5",
        md: "h-9 px-3.5 [&_svg]:size-4",
        lg: "h-11 px-5 [&_svg]:size-4",
        xl: "h-14 px-7 text-base [&_svg]:size-5",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      data-loading={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { buttonVariants };
