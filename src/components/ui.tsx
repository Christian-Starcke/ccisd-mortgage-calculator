"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { formatUSD, parseLooseNumber } from "@/lib/money";

export function Card({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-6 ${className}`}>
      {title && (
        <header className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-pretty text-base font-semibold tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm leading-relaxed text-pretty text-ink-500">
                {subtitle}
              </p>
            )}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{hint}</p>}
    </div>
  );
}

/**
 * Tracks a free-text draft of a numeric value while the field is being edited.
 *
 * Two problems have to be solved at once. Reformatting on every keystroke makes
 * the caret jump, which is the classic bug in formatted numeric inputs, so the
 * raw text has to be held while typing. But the value can also change from
 * outside the input, such as the Reset button or a slider bound to the same
 * state, and in that case the draft is stale and has to be thrown away.
 *
 * Distinguishing the two comes down to remembering the last value this input
 * emitted. If the incoming value matches, the change was our own echo and the
 * draft is still good. If it does not, someone else changed it.
 */
function useNumericDraft(value: number) {
  const [draft, setDraft] = useState<string | null>(null);
  const [emitted, setEmitted] = useState(value);

  if (value !== emitted) {
    setEmitted(value);
    if (draft !== null) setDraft(null);
  }

  return { draft, setDraft, setEmitted };
}

/**
 * Currency input that lets the user type freely (commas, "$", "425k") but
 * reformats to a clean currency string as soon as focus leaves.
 */
export function CurrencyInput({
  value,
  onChange,
  min = 0,
  max = 100_000_000,
  step,
  id,
  placeholder,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  placeholder?: string;
}) {
  const { draft, setDraft, setEmitted } = useNumericDraft(value);

  const display =
    draft !== null ? draft : value === 0 ? "" : formatUSD(value, 0);

  const emit = (next: number) => {
    setEmitted(next);
    onChange(next);
  };

  return (
    <input
      id={id}
      className="text-input"
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      placeholder={placeholder ?? "$0"}
      value={display}
      onFocus={() => setDraft(value === 0 ? "" : String(Math.round(value)))}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const parsed = parseLooseNumber(next);
        if (parsed !== null) {
          emit(Math.min(Math.max(parsed, min), max));
        } else if (next.trim() === "") {
          emit(0);
        }
      }}
      onBlur={() => setDraft(null)}
      step={step}
    />
  );
}

/**
 * Percent input working in display units (6.625) while storing a fraction
 * (0.06625), so the rest of the app never has to remember which form it holds.
 */
export function PercentInput({
  value,
  onChange,
  min = 0,
  max = 100,
  decimals = 3,
  id,
}: {
  value: number;
  onChange: (fraction: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  id?: string;
}) {
  const { draft, setDraft, setEmitted } = useNumericDraft(value);
  const asPercent = value * 100;

  const display =
    draft !== null
      ? draft
      : `${Number.parseFloat(asPercent.toFixed(decimals))}`;

  const emit = (fraction: number) => {
    setEmitted(fraction);
    onChange(fraction);
  };

  return (
    <div className="relative">
      <input
        id={id}
        className="text-input pr-8"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={display}
        onFocus={() => setDraft(display)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = parseLooseNumber(next);
          if (parsed !== null) {
            emit(Math.min(Math.max(parsed, min), max) / 100);
          } else if (next.trim() === "") {
            emit(0);
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
        %
      </span>
    </div>
  );
}

/**
 * A rate quoted in cents but stored in dollars.
 *
 * `CurrencyInput` formats to whole dollars and rounds on focus, so a per-unit
 * rate like $0.15 a kWh displayed as "$0" and collapsed to zero the moment the
 * field was touched. Utility rates in this district are all sub-dollar —
 * electricity per kWh, the gas pass-through per Ccf — so they get their own
 * control, working in display units the way `PercentInput` does rather than
 * fighting the currency formatter.
 */
export function CentsInput({
  value,
  onChange,
  min = 0,
  max = 1000,
  decimals = 2,
  unit,
  id,
}: {
  /** Stored in dollars per unit, e.g. 0.15. */
  value: number;
  onChange: (dollarsPerUnit: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  /** What the rate is per, e.g. "kWh" — shown after the cent sign. */
  unit?: string;
  id?: string;
}) {
  const { draft, setDraft, setEmitted } = useNumericDraft(value);
  const asCents = value * 100;

  const display =
    draft !== null ? draft : `${Number.parseFloat(asCents.toFixed(decimals))}`;

  const emit = (dollars: number) => {
    setEmitted(dollars);
    onChange(dollars);
  };

  return (
    <div className="relative">
      <input
        id={id}
        className={unit ? "text-input pr-20" : "text-input pr-8"}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={display}
        onFocus={() => setDraft(display)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = parseLooseNumber(next);
          if (parsed !== null) {
            emit(Math.min(Math.max(parsed, min), max) / 100);
          } else if (next.trim() === "") {
            emit(0);
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
        {unit ? `¢/${unit}` : "¢"}
      </span>
    </div>
  );
}

/**
 * Number input with the same draft treatment as the currency and percent
 * inputs. Without it, typing into a pre-populated field appends to what is
 * already there ("3" then "4" reads as "34") and the mid-keystroke clamp
 * rewrites the field to the max, which behaves like the input refusing the
 * keystroke.
 *
 * While editing, the raw text is held and only in-range values are emitted,
 * so partial input like "7" on the way to "720" is not clamped to the
 * minimum mid-word. The final value is clamped and committed on blur, and
 * focus selects the whole value so a click plus typing replaces it.
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 1_000,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
}) {
  const { draft, setDraft, setEmitted } = useNumericDraft(value);

  const display = draft !== null ? draft : String(value);

  const emit = (next: number) => {
    setEmitted(next);
    onChange(next);
  };

  return (
    <input
      id={id}
      type="number"
      className="text-input"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      min={min}
      max={max}
      onFocus={(event) => {
        setDraft(String(value));
        event.target.select();
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const parsed = Number.parseFloat(next);
        if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
          emit(parsed);
        }
      }}
      onBlur={() => {
        if (draft !== null) {
          const parsed = Number.parseFloat(draft);
          if (Number.isFinite(parsed)) {
            emit(Math.min(Math.max(parsed, min), max));
          }
        }
        setDraft(null);
      }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  id,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <input
      id={id}
      className="text-input"
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  id?: string;
}) {
  return (
    <select
      id={id}
      className="text-input cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%239b9b94%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%239b9b94%22 stroke-width=%221.5%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:1.25rem] bg-[right_0.65rem_center] bg-no-repeat pr-10"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer gap-3 py-1">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-ink-300"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug text-ink-800">
          {label}
        </span>
        {hint && (
          <span className="mt-1 block text-xs leading-relaxed text-ink-500">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  format,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  id?: string;
}) {
  return (
    <div>
      <input
        id={id}
        type="range"
        className="w-full cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      />
      <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-400">
        <span>{format(min)}</span>
        <span className="font-semibold text-ink-700">{format(value)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  size = "md",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  size?: "md" | "lg";
}) {
  const toneClass = {
    neutral: "text-ink-900",
    good: "text-brand-600",
    warn: "text-flag-700",
    bad: "text-alert-700",
  }[tone];

  return (
    <div className="min-w-0">
      <div className="field-label">{label}</div>
      <div
        className={`tnum break-words font-semibold tracking-tight ${toneClass} ${
          size === "lg" ? "text-2xl sm:text-3xl lg:text-4xl" : "text-xl"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs leading-relaxed text-ink-500">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
}) {
  const toneClass = {
    neutral: "bg-ink-100 text-ink-600",
    good: "bg-brand-100 text-brand-700",
    warn: "bg-flag-100 text-flag-700",
    bad: "bg-alert-100 text-alert-700",
    brand: "bg-brand-600 text-white",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

/** A labeled row in a breakdown list, with the amount right-aligned. */
export function LineItem({
  label,
  amount,
  note,
  emphasis = false,
  tone = "neutral",
  swatch,
}: {
  label: ReactNode;
  amount: string;
  note?: ReactNode;
  emphasis?: boolean;
  tone?: "neutral" | "good" | "bad";
  swatch?: string;
}) {
  const toneClass = {
    neutral: "text-ink-900",
    good: "text-brand-600",
    bad: "text-alert-700",
  }[tone];

  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2.5 sm:gap-4 sm:py-2 ${
        emphasis ? "border-t border-ink-200 pt-3 font-semibold" : ""
      }`}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        {swatch && (
          <span
            className="mt-1 size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: swatch }}
            aria-hidden
          />
        )}
        <div className="min-w-0">
          <div
            className={`text-sm leading-snug ${emphasis ? "text-ink-900" : "text-ink-700"}`}
          >
            {label}
          </div>
          {note && (
            <div className="mt-0.5 text-xs leading-relaxed text-ink-500">{note}</div>
          )}
        </div>
      </div>
      <div className={`tnum shrink-0 text-sm ${toneClass}`}>{amount}</div>
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-ink-100 border-ink-200 text-ink-700",
    good: "bg-brand-50 border-brand-200 text-brand-800",
    warn: "bg-flag-50 border-flag-100 text-flag-700",
    bad: "bg-alert-50 border-alert-100 text-alert-700",
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-3 text-sm leading-relaxed break-words sm:px-4 ${styles}`}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

/** Collapsible section, closed by default, for detail that would add noise. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 py-2 text-left text-sm font-medium text-brand-600 hover:text-brand-700">
        <svg
          className="mt-0.5 size-4 shrink-0 transition-transform duration-150 group-open:rotate-90"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <path
            d="M7.5 5.5 12 10l-4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        {summary}
      </summary>
      <div className="pb-2 sm:pl-6">{children}</div>
    </details>
  );
}

/**
 * Persists calculator state to localStorage so a refresh does not wipe inputs.
 *
 * The stored value is read in the state initializer rather than in an effect,
 * which avoids a second render pass. That is only safe because the calculator is
 * mounted client-side only; rendering it on the server would make the first
 * client render disagree with the server HTML.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  /**
   * Repairs a stored value before it is trusted. Parsing successfully is not
   * the same as being usable: a field that indexes into a table can name
   * something that no longer exists, and the merge below will happily carry it
   * through. Anything that throws in here falls back to the defaults.
   */
  revive: (stored: T) => T = (stored) => stored,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) return initial;
      // Spreading over the defaults means a stored value written by an older
      // version of the app still picks up any newly added fields.
      return revive({ ...initial, ...JSON.parse(stored) });
    } catch {
      // A corrupt or unusable store should never break the calculator.
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore quota and privacy-mode failures.
    }
  }, [key, state]);

  return [state, setState];
}
