import clsx from "clsx";
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { EquipmentStatus, RecordStatus } from "@ecl/shared";

/**
 * A small set of primitives written by hand rather than pulled from a component
 * library. The surface here is narrow enough that a dependency would cost more
 * to configure than to write.
 */

// --- Button ---------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary:
    "bg-white text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
};

export function Button({
  variant = "primary",
  className,
  isLoading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; isLoading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled ?? isLoading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed",
        buttonVariants[variant],
        className,
      )}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

// --- Badges ---------------------------------------------------------------

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "VERIFIED"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ring-inset"
          : "bg-amber-50 text-amber-800 ring-1 ring-amber-200 ring-inset",
      )}
    >
      <span
        aria-hidden
        className={clsx("size-1.5 rounded-full", status === "VERIFIED" ? "bg-emerald-500" : "bg-amber-500")}
      />
      {status === "VERIFIED" ? "Verified" : "Pending"}
    </span>
  );
}

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        status === "ACTIVE"
          ? "bg-slate-100 text-slate-700 ring-slate-200"
          : "bg-slate-100 text-slate-500 ring-slate-200",
      )}
    >
      {status === "ACTIVE" ? "Active" : "Retired"}
    </span>
  );
}

// --- Form controls --------------------------------------------------------

export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset " +
  "placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(controlClass, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(controlClass, "resize-y", className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx(controlClass, "pr-8", className)}>
      {children}
    </select>
  );
}

// --- Layout ---------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-lg bg-white shadow-sm ring-1 ring-slate-200", className)}>{children}</div>
  );
}

// --- Async states ---------------------------------------------------------

/**
 * Every list in the app renders one of four states. Having them as shared
 * components is what keeps "loading" from silently becoming "empty" in one
 * place and a blank screen in another.
 */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4 px-4 py-3.5">
          {Array.from({ length: columns }, (_, column) => (
            <div
              key={column}
              className="h-4 flex-1 animate-pulse rounded bg-slate-100"
              style={{ maxWidth: column === 0 ? "40%" : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-6 py-14 text-center" role="alert">
      <p className="text-sm font-medium text-red-700">Something went wrong</p>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
      {onRetry ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 ring-inset">
      {children}
    </div>
  );
}

// --- Modal ----------------------------------------------------------------

/**
 * Uses the native `<dialog>` element, which brings focus trapping, Escape to
 * close, and the top layer for free — all things a hand-rolled overlay usually
 * gets wrong.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) dismisses.
        if (event.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto w-[calc(100vw-2rem)] rounded-lg bg-white p-0 shadow-xl backdrop:bg-slate-900/40",
        width,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 px-2">
          ✕
        </Button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
