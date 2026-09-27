import { useEffect, useState } from "react";
import type { Dict } from "../../i18n/en";
import { fill, store } from "./common";

interface Props {
  t: Dict["tools"]["sitting"];
  lang: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

function Field({ id, label, value, onChange, min, max, step }: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="range-field">
      <label htmlFor={id}>{label}</label>
      <div className="range-field__row">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        />
      </div>
    </div>
  );
}

/** Times of the day for the first few breaks, starting at 9:00. */
function schedule(workHours: number) {
  const items: { at: number; kind: "micro" | "stand" }[] = [];
  const end = Math.min(workHours, 3) * 60;
  for (let m = 20; m <= end; m += 20) items.push({ at: m, kind: m % 40 === 0 ? "stand" : "micro" });
  return items;
}

const clock = (startMin: number, plus: number) => {
  const m = startMin + plus;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

export default function SittingCalc({ t, lang }: Props) {
  const [work, setWork] = useState(7);
  const [other, setOther] = useState(3);
  const [active, setActive] = useState(60);
  useEffect(() => {
    const s = store.get<{ work?: number; other?: number; active?: number }>("sitting", {});
    if (typeof s.work === "number") setWork(s.work);
    if (typeof s.other === "number") setOther(s.other);
    if (typeof s.active === "number") setActive(s.active);
  }, []);
  useEffect(() => store.set("sitting", { work, other, active }), [work, other, active]);

  const total = work + other;
  const level = total < 6 ? "low" : total < 9 ? "mid" : "high";
  const micro = Math.floor((work * 60) / 20);
  const stand = Math.floor((work * 60) / 40);
  const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 1 });

  return (
    <div className="tool sitting">
      <Field id="work" label={t.work} value={work} onChange={setWork} min={0} max={14} step={0.5} />
      <Field id="other" label={t.other} value={other} onChange={setOther} min={0} max={10} step={0.5} />
      <Field id="active" label={t.active} value={active} onChange={setActive} min={0} max={600} step={10} />

      <div className={`result result--${level}`} aria-live="polite">
        <p className="result__label">{t.total}</p>
        <p className="result__value">
          <b>{fmt(total)}</b> {t.perDay}
        </p>
        <p>{fill(t.perWeek, { n: fmt(total * 7) })}</p>
        <p>{t.levels[level]}</p>
        <p>{active >= 150 ? fill(t.activityOk, { n: active }) : fill(t.activityLow, { n: 150 - active })}</p>
      </div>

      {work > 0 && (
        <>
          <h3>{t.scheduleTitle}</h3>
          <p>{fill(t.scheduleText, { h: fmt(work), micro, stand })}</p>
          <ol className="schedule">
            <li>
              <time>9:00</time> {t.startAt}
            </li>
            {schedule(work).map((s) => (
              <li key={s.at} className={`schedule__item schedule__item--${s.kind}`}>
                <time>{clock(9 * 60, s.at)}</time> {s.kind === "micro" ? t.micro : t.stand}
              </li>
            ))}
            <li aria-hidden="true">…</li>
          </ol>
        </>
      )}
    </div>
  );
}
