import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Block-lettered labels, like the printed headings on a duty roster. 44px minimum height on the
 * control itself so a guard can hit "CHECK IN" on a phone without aiming.
 */
export function Label({
  className,
  required,
  htmlFor,
  children,
  ...props
}: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      className={cn("label-block", className)}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-1 text-critical" aria-hidden>
          *
        </span>
      ) : null}
      {required ? <span className="sr-only"> (required)</span> : null}
    </label>
  );
}

const inputVariants = cva(
  "w-full rounded-md border border-border-base bg-surface-inset text-sm text-foreground placeholder:text-foreground-subtle transition-colors outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-critical aria-invalid:focus-visible:ring-critical/40",
  {
    variants: {
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-10 px-3",
        lg: "h-12 px-4 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>;

export function Input({ className, size, ...props }: InputProps) {
  const isNumeric =
    props.type === "number" || props.type === "time" || props.type === "date";

  return (
    <input
      className={cn(
        inputVariants({ size }),
        isNumeric && "font-mono",
        className,
      )}
      {...(isNumeric ? { "data-numeric": true } : {})}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        inputVariants({ size: "md" }),
        "min-h-20 resize-y py-2 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          inputVariants({ size: "md" }),
          "cursor-pointer appearance-none pr-8",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        role="presentation"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-foreground-subtle"
      >
        <path
          d="M6 8l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Search input. Always paired with a visible or explicit accessible label — an icon-only search
 * box is unusable with a screen reader, so the placeholder is duplicated into an sr-only label.
 */
export function SearchInput({
  className,
  label = "Search",
  ...props
}: React.ComponentProps<"input"> & { label?: string }) {
  return (
    <div className={cn("relative", className)}>
      <svg
        aria-hidden="true"
        role="presentation"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-foreground-subtle"
      >
        <circle
          cx="8.5"
          cy="8.5"
          r="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12.5 12.5L17 17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="search"
        aria-label={label}
        placeholder={props.placeholder ?? `Search ${label.toLowerCase()}`}
        className={cn(inputVariants({ size: "md" }), "pl-8")}
        {...props}
      />
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-foreground-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export { inputVariants };
