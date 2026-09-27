import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Source } from "../../lib/sources";

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section__head">
        <h2 className="section__title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, hint, disabled, children }: { label: string; hint?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    // A <label> around the text and the control gives the control its accessible name.
    <label className={`row ${disabled ? "row--disabled" : ""}`}>
      <span className="row__label">
        {label}
        {hint && <small className="row__hint">{hint}</small>}
      </span>
      <fieldset disabled={disabled}>{children}</fieldset>
    </label>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`row toggle ${disabled ? "row--disabled" : ""}`}>
      <span className="row__label">
        {label}
        {hint && <small className="row__hint">{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function NumberSelect({ value, options, unit, onChange, label }: {
  value: number;
  options: number[];
  unit: string;
  onChange: (v: number) => void;
  label?: string;
}) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <select value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {all.map((n) => (
        <option key={n} value={n}>
          {n} {unit}
        </option>
      ))}
    </select>
  );
}

export function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return <input type="time" value={value} aria-label={label} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href);
      }}
    >
      {children}
    </a>
  );
}

/** "Why this": mechanism in plain words, main sources, when to see a doctor. */
export function Why({ id, sources }: { id: string; sources: Source[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="why">
      <button className="why__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("why.toggle")}
      </button>
      {open && (
        <div className="why__body">
          <p>{t(`why.${id}.text`)}</p>
          <p className="notice">
            <b>{t("why.doctor")}</b> {t(`why.${id}.doctor`)}
          </p>
          <ul className="why__sources">
            {sources.map((s) => (
              <li key={s.url}>
                <ExternalLink href={s.url}>{s.label}</ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
