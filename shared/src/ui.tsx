import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SVGProps } from "react";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/* ---------- Brand ---------- */

export function ViexMark({ size = 16, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      <rect x="2.5" y="4.5" width="19" height="12.5" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="10.75" r="2.7" fill="currentColor" />
      <path d="M8.5 20.5h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** `viex.` wordmark with the blue full stop and a boxed tag, like Yap's "yap. STT". */
export function Wordmark({ tag }: { tag?: string }) {
  return (
    <div className="flex items-center gap-2 px-1.5">
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground text-background">
        <ViexMark size={16} />
      </span>
      <span className="text-[17px] font-semibold leading-none tracking-[-0.04em]">
        viex<span className="text-primary">.</span>
      </span>
      {tag && (
        <span className="rounded-[5px] border border-border bg-muted px-1 py-[3px] font-mono text-[9.5px] font-medium leading-none text-muted-foreground">
          {tag}
        </span>
      )}
    </div>
  );
}

/* ---------- Layout ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-title font-semibold leading-8 tracking-[-0.03em]">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <span className="flex items-baseline gap-1.5 px-1 pb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
      {count !== undefined && <span className="text-muted-foreground/55">{count}</span>}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-card border border-border bg-background shadow-rest", className)}>{children}</div>
  );
}

/** A labelled row inside a Card: title + hint on the left, control on the right. */
export function SettingRow({
  title,
  hint,
  children,
  stacked,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex gap-4 border-b border-border px-4 py-3.5 last:border-b-0",
        stacked ? "flex-col" : "items-center justify-between",
      )}
    >
      <div className="min-w-0">
        <div className="text-[14px] font-medium leading-5">{title}</div>
        {hint && <div className="mt-0.5 text-small leading-[18px] text-ink-3">{hint}</div>}
      </div>
      {children && <div className={cx("shrink-0", stacked && "w-full")}>{children}</div>}
    </div>
  );
}

/* ---------- Controls ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-primary text-on-accent hover:brightness-110 border-transparent",
    secondary: "bg-background text-foreground border-input hover:bg-accent",
    ghost: "bg-transparent text-muted-foreground border-transparent hover:bg-accent hover:text-foreground",
    danger: "bg-error-wash text-error border-transparent hover:brightness-95",
  };
  const sizes = { sm: "h-8 px-3 text-small", md: "h-9 px-3.5 text-small", lg: "h-11 px-5 text-body" };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-control border font-medium transition-[background-color,filter,opacity,transform] duration-200 ease-glide active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}

export function TextInput({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string | null }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-label font-medium text-ink-2">
          {label}
        </label>
      )}
      <input
        id={id}
        {...props}
        className={cx(
          "h-10 w-full rounded-control border bg-muted/50 px-3 text-[14px] text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-input focus:border-ring/50 focus:bg-background focus:ring-[3px] focus:ring-ring/12",
          error ? "border-error" : "border-border",
          className,
        )}
      />
      {error ? (
        <p className="text-label text-error">{error}</p>
      ) : (
        hint && <p className="text-label text-ink-3">{hint}</p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string | null }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-label font-medium text-ink-2">
          {label}
        </label>
      )}
      <textarea
        id={id}
        {...props}
        className={cx(
          "w-full rounded-control border bg-muted/50 px-3 py-2 font-mono text-[12.5px] leading-5 text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-input focus:border-ring/50 focus:bg-background focus:ring-[3px] focus:ring-ring/12",
          error ? "border-error" : "border-border",
          className,
        )}
      />
      {error ? (
        <p className="text-label text-error">{error}</p>
      ) : (
        hint && <p className="text-label text-ink-3">{hint}</p>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200 ease-glide disabled:opacity-50",
        checked ? "border-transparent bg-primary" : "border-input bg-muted",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-5 rounded-full bg-surface shadow-rest transition-[left] duration-200 ease-spring",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-control border border-border bg-muted/60 p-0.5" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "h-7 rounded-[6px] px-2.5 text-small font-medium transition-colors duration-200",
            value === option.value
              ? "border border-border bg-background text-foreground shadow-rest"
              : "border border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Status ---------- */

export function StatusDot({ tone, pulse }: { tone: "online" | "offline" | "busy" | "live" | "warn"; pulse?: boolean }) {
  const colors = {
    online: "bg-moss",
    offline: "bg-ink-3/50",
    busy: "bg-warning",
    live: "bg-error",
    warn: "bg-warning",
  };
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", colors[tone], pulse && "animate-live")} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "error" | "primary" }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground border-border",
    ok: "bg-moss-wash text-moss border-transparent",
    warn: "bg-warning-wash text-warning border-transparent",
    error: "bg-error-wash text-error border-transparent",
    primary: "bg-primary-soft text-primary border-transparent",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 font-mono text-tag font-medium leading-none",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "warn", title, children }: { tone?: "warn" | "error" | "ok"; title?: string; children: ReactNode }) {
  const tones = {
    warn: "bg-warning-wash text-warning",
    error: "bg-error-wash text-error",
    ok: "bg-moss-wash text-moss",
  };
  return (
    <div className={cx("rounded-control px-3.5 py-3 text-small leading-5", tones[tone])}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5 text-foreground/80" : "text-foreground/90"}>{children}</div>
    </div>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 animate-fade" role="presentation">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] rounded-panel border border-border bg-surface p-5 shadow-pop outline-none animate-pop"
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
        <div className="mt-2 text-body text-ink-2">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

/* ---------- Icons (24px grid, stroke) ---------- */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const icon =
  (paths: ReactNode) =>
  ({ size = 16, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths}
    </svg>
  );

export const IconMonitor = icon(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2.5" />
    <path d="M8 20h8M12 16v4" />
  </>,
);
export const IconDevices = icon(
  <>
    <rect x="2.5" y="5" width="13" height="9" rx="2" />
    <rect x="14" y="9" width="7.5" height="11" rx="2" />
    <path d="M6 18h4" />
  </>,
);
export const IconShield = icon(<path d="M12 3l7.5 3v5.5c0 4.5-3 7.8-7.5 9.5-4.5-1.7-7.5-5-7.5-9.5V6L12 3z" />);
export const IconNetwork = icon(
  <>
    <circle cx="12" cy="5" r="2" />
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="18" r="2" />
    <path d="M12 7v4M12 11l-6 5M12 11l6 5" />
  </>,
);
export const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
  </>,
);
export const IconInfo = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);
export const IconGrid = icon(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </>,
);
export const IconExpand = icon(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const IconClose = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const IconRefresh = icon(<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />);
export const IconPlay = icon(<path d="M8 5.5v13l11-6.5-11-6.5z" />);
export const IconLock = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
  </>,
);
export const IconUsers = icon(
  <>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 6.2a3 3 0 010 5.6M17.5 14.7c1.7.5 2.8 1.9 3.2 4.3" />
  </>,
);
