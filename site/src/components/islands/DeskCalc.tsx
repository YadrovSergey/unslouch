import { useEffect, useState } from "react";
import { deskHeights } from "@app/lib/deskHeight";
import type { Dict } from "../../i18n/en";
import { fill, store } from "./common";

type T = Dict["tools"]["deskHeight"];

const toIn = (cm: number) => cm / 2.54;

export default function DeskCalc({ text, imperial }: { text: T; imperial: boolean }) {
  const [cm, setCm] = useState(175);
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  useEffect(() => {
    setCm(store.get("heightCm", 175));
    if (imperial) setUnit(store.get("unit", "cm"));
  }, []);
  const saveCm = (v: number) => {
    setCm(v);
    if (v >= 140 && v <= 220) store.set("heightCm", v);
  };
  const saveUnit = (u: "cm" | "in") => {
    setUnit(u);
    store.set("unit", u);
  };

  const valid = cm >= 140 && cm <= 220;
  const h = deskHeights(valid ? cm : 175);
  const show = (v: number) => (unit === "in" ? `${Math.round(toIn(v))} ${text.inches}` : `${v} ${text.unitCm}`);
  const feet = Math.floor(toIn(cm) / 12);
  const inches = Math.round(toIn(cm) - feet * 12);

  const rows: [string, string, string][] = [
    [text.seat, show(h.seat), text.seatHint],
    [text.desk, show(h.desk), text.deskHint],
    [text.screenTop, show(h.screenTop), text.screenHint],
    [text.standingDesk, show(h.standingDesk), text.standingHint],
    [
      text.screenDistance,
      unit === "in"
        ? `${fill(text.range, { a: 20, b: 28 })} ${text.inches}`
        : `${fill(text.range, { a: h.screenDistance[0], b: h.screenDistance[1] })} ${text.unitCm}`,
      text.distanceHint,
    ],
  ];

  return (
    <div className="tool calc">
      <div className="calc__input">
        <label htmlFor="height">{text.height}</label>
        {unit === "cm" ? (
          <span className="field">
            <input
              id="height"
              type="number"
              inputMode="numeric"
              min={140}
              max={220}
              value={Number.isFinite(cm) ? cm : ""}
              onChange={(e) => saveCm(Number(e.target.value))}
            />
            <span>{text.unitCm}</span>
          </span>
        ) : (
          <span className="field">
            <input
              id="height"
              type="number"
              inputMode="numeric"
              min={4}
              max={7}
              value={feet}
              aria-label={text.feet}
              onChange={(e) => saveCm(Math.round((Number(e.target.value) * 12 + inches) * 2.54))}
            />
            <span>{text.feet}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              value={inches}
              aria-label={text.inches}
              onChange={(e) => saveCm(Math.round((feet * 12 + Number(e.target.value)) * 2.54))}
            />
            <span>{text.inches}</span>
          </span>
        )}
        {imperial && (
          <span className="segmented" role="group">
            <button type="button" aria-pressed={unit === "cm"} onClick={() => saveUnit("cm")}>
              {text.unitCm}
            </button>
            <button type="button" aria-pressed={unit === "in"} onClick={() => saveUnit("in")}>
              {text.unitIn}
            </button>
          </span>
        )}
      </div>
      <input
        className="calc__range"
        type="range"
        min={140}
        max={220}
        value={valid ? cm : 175}
        aria-label={text.height}
        onChange={(e) => saveCm(Number(e.target.value))}
      />
      <h3 className="calc__title">{text.results}</h3>
      <dl className="calc__result">
        {rows.map(([label, value, hint]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <dd className="calc__hint">{hint}</dd>
          </div>
        ))}
      </dl>
      <p className="tool-note">{text.note}</p>
    </div>
  );
}
