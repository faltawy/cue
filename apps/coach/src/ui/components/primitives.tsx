import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useEffect, useState } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function useFlag(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), 1_500);
    return () => clearTimeout(timer);
  }, [on]);
  return [on, () => setOn(true)];
}

const KEY_GLYPHS: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  shift: "⇧",
  alt: "⌥",
  enter: "⏎",
  esc: "Esc",
  up: "↑",
};

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "mod"];

export function orderKeys(keys: readonly string[]): string[] {
  const rank = (key: string) => {
    const index = MODIFIER_ORDER.indexOf(key);
    return index === -1 ? MODIFIER_ORDER.length : index;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)} aria-hidden>
      {orderKeys(keys).map((key) => (
        <kbd
          key={key}
          className="min-w-[1.35em] rounded-[4px] border border-border bg-surface px-1 text-center font-sans text-[10.5px] leading-[1.5] font-medium text-muted-foreground tabular-nums"
        >
          {KEY_GLYPHS[key] ?? key.toUpperCase()}
        </kbd>
      ))}
    </span>
  );
}

export function shortcutLabel(keys: string[]): string {
  return orderKeys(keys)
    .map((key) => KEY_GLYPHS[key] ?? key.toUpperCase())
    .join("");
}

type Tone = "primary" | "outline" | "ghost" | "danger";

const TONES: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 disabled:opacity-40",
  outline:
    "border border-border bg-surface text-foreground hover:bg-muted active:bg-accent disabled:opacity-50 disabled:hover:bg-surface",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
  danger: "border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md"; wrap?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = "outline", size = "sm", wrap = false, className, type = "button", ...props },
  ref,
) {
  const height = size === "sm" ? (wrap ? "min-h-7 py-1" : "h-7") : wrap ? "min-h-8 py-1" : "h-8";
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,color,opacity] duration-100 select-none [&>svg]:shrink-0",
        wrap ? "max-w-full min-w-0 shrink text-start whitespace-normal" : "shrink-0 whitespace-nowrap",
        height,
        size === "sm" ? "px-2.5 text-[12.5px]" : "px-3 text-[13px]",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string[];
  tooltipSide?: "top" | "bottom";
  tooltipAlign?: "center" | "end" | "start";
  tone?: "ghost" | "primary" | "quiet";
  children: ReactNode;
};

const ICON_TONES = {
  ghost:
    "rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
  primary: "rounded-full bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
  quiet: "rounded-full bg-muted text-muted-foreground",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    shortcut,
    tooltipSide = "bottom",
    tooltipAlign = "center",
    tone = "ghost",
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide} align={tooltipAlign}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-keyshortcuts={shortcut ? ariaShortcut(shortcut) : undefined}
        className={cx(
          "grid shrink-0 place-items-center transition-[background-color,color,opacity] duration-100",
          className ?? "size-7",
          ICON_TONES[tone],
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
});

export function ariaShortcut(keys: string[]): string {
  return keys
    .map((key) => ({ mod: "Meta", shift: "Shift", alt: "Alt", enter: "Enter", esc: "Escape", up: "ArrowUp" })[key] ?? key.toUpperCase())
    .join("+");
}

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  align = "center",
  children,
}: {
  label: string;
  shortcut?: string[];
  side?: "top" | "bottom";
  align?: "center" | "end" | "start";
  children: ReactNode;
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute z-30 flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-[11.5px] font-medium whitespace-nowrap text-primary-foreground opacity-0 shadow-lg transition-opacity delay-0 duration-100 group-hover/tip:opacity-100 group-hover/tip:delay-500 group-has-[:focus-visible]/tip:opacity-100",
          side === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "end" && "right-0",
          align === "start" && "left-0",
        )}
      >
        {label}
        {shortcut && <span className="text-primary-foreground/60">{shortcutLabel(shortcut)}</span>}
      </span>
    </span>
  );
}
