import type { ReactNode } from "react";
import type { Tone } from "@/lib/demo/job-status";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-paper-deep text-navy ring-line",
  teal: "bg-ready-soft text-ready ring-ready/30",
  amber: "bg-awaiting-soft text-awaiting ring-awaiting/25",
  red: "bg-blocked-soft text-blocked ring-blocked/25",
};

const SOLID_TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-navy text-white ring-navy",
  teal: "bg-ready text-white ring-ready",
  amber: "bg-awaiting text-white ring-awaiting",
  red: "bg-blocked text-white ring-blocked",
};

/** `solid` fills the badge; reserved for the status a dispatcher should act on first. */
export function Badge({ tone = "neutral", solid = false, children }: { tone?: Tone; solid?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        solid ? SOLID_TONE_CLASSES[tone] : TONE_CLASSES[tone]
      }`}
    >
      {children}
    </span>
  );
}

export function SyntheticBadge({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ring-1 ring-inset ${
        onDark ? "bg-amber-400/15 text-amber-200 ring-amber-300/40" : "bg-awaiting-soft text-awaiting ring-awaiting/30"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      Synthetic demo data
    </span>
  );
}

/** 3×2 tile mark from the pitch deck. */
export function BrandMark() {
  const tiles = ["bg-tile-orange", "bg-tile-teal", "bg-tile-slate", "bg-tile-slate", "bg-tile-orange", "bg-tile-teal"];
  return (
    <span className="grid shrink-0 grid-cols-3 gap-[3px]" aria-hidden>
      {tiles.map((tile, i) => (
        <span key={i} className={`h-3 w-3 rounded-[2px] ${tile}`} />
      ))}
    </span>
  );
}

/** Product name block at the top of both sidebars. */
export function SidebarBrand() {
  return (
    <div className="border-b border-white/10 px-6 py-6">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <p className="font-display text-2xl font-semibold leading-none tracking-tight text-white">GateRescue</p>
          <p className="mt-1 text-xs text-slate-300">Drayage disruption desk</p>
        </div>
      </div>
      <div className="mt-4">
        <SyntheticBadge onDark />
      </div>
    </div>
  );
}

export function Panel({
  id,
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`lift rounded-card border border-line bg-white shadow-card ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5 text-rust">{eyebrow}</p>}
          <h2 className="font-display text-xl font-semibold leading-tight tracking-tight text-navy">{title}</h2>
          {subtitle && <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-navy text-white hover:bg-navy-soft disabled:bg-line disabled:text-ink-muted",
  secondary: "bg-white text-navy ring-1 ring-inset ring-line hover:bg-paper disabled:text-ink-muted disabled:hover:bg-white",
  danger: "bg-blocked text-white hover:bg-[#8a2019] disabled:bg-line disabled:text-ink-muted",
  warning: "bg-awaiting-soft text-awaiting ring-1 ring-inset ring-awaiting/30 hover:bg-[#f7e4bb] disabled:bg-line disabled:text-ink-muted",
  ghostDark:
    "bg-white/5 text-slate-100 ring-1 ring-inset ring-white/15 hover:bg-white/10 disabled:text-slate-400 disabled:hover:bg-white/5",
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
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 font-semibold transition-colors disabled:cursor-not-allowed ${
        size === "sm" ? "px-3.5 text-xs" : "px-5 text-sm"
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

/** Shimmering placeholder block shown while data loads. Decorative: pair it with sr-only status text. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}

const LIGHT_CLASSES = {
  ready: { dot: "bg-teal-300 ring-teal-300/20", text: "text-teal-100" },
  awaiting: { dot: "bg-amber-300 ring-amber-300/20", text: "text-amber-100" },
  blocked: { dot: "bg-red-400 ring-red-400/25", text: "text-red-100" },
  muted: { dot: "bg-slate-400 ring-slate-400/20", text: "text-slate-300" },
} as const;

/** Small status light with a text label, for the navy sidebar. The label always carries the meaning. */
export function StatusLight({
  tone,
  label,
  pulse = false,
}: {
  tone: keyof typeof LIGHT_CLASSES;
  label: string;
  pulse?: boolean;
}) {
  const light = LIGHT_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-2.5 text-xs font-medium ${light.text}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ring-4 ${light.dot} ${pulse ? "animate-pulse" : ""}`} aria-hidden />
      {label}
    </span>
  );
}

/** In-page jump link styled as a secondary pill; meets the 44px target size. */
export function JumpLink({ href, children, onDark = false }: { href: string; children: ReactNode; onDark?: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-11 items-center gap-1 px-4 text-sm font-semibold underline-offset-4 hover:underline ${
        onDark ? "bg-white/10 text-white ring-1 ring-inset ring-white/25" : "bg-white text-navy ring-1 ring-inset ring-line"
      }`}
    >
      {children}
    </a>
  );
}
