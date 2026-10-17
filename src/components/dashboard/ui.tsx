import type { ReactNode } from "react";
import type { Tone } from "@/lib/demo/job-status";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-300",
  red: "bg-red-50 text-red-700 ring-red-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function SyntheticBadge({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${
        onDark ? "bg-amber-400/15 text-amber-300 ring-amber-400/40" : "bg-amber-100 text-amber-900 ring-amber-300"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      Synthetic demo data
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-teal-600 text-white hover:bg-teal-700 disabled:bg-slate-300",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300",
  warning: "bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:bg-slate-300 disabled:text-slate-500",
  ghostDark: "bg-white/5 text-slate-100 ring-1 ring-inset ring-white/15 hover:bg-white/10 disabled:text-slate-500 disabled:hover:bg-white/5",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}
