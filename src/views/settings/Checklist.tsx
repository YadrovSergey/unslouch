import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deskHeights } from "../../lib/deskHeight";

const ITEMS = ["screenHeight", "screenDistance", "elbows", "wrists", "feet", "back", "light"] as const;
const STORAGE_KEY = "unslouch.checklist";
const HEIGHT_KEY = "unslouch.height";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A checklist tick is a convenience, losing it is fine.
  }
}

/** Workstation setup by OSHA recommendations, plus heights from body height. */
export function Checklist() {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<string[]>(() => load(STORAGE_KEY, []));
  const [height, setHeight] = useState<number>(() => load(HEIGHT_KEY, 175));
  const d = deskHeights(height);

  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(next);
    store(STORAGE_KEY, next);
  };

  return (
    <div className="checklist">
      <div className="calc">
        <label className="calc__input">
          {t("checklist.height")}
          <input
            type="number"
            min={140}
            max={220}
            value={height}
            onChange={(e) => {
              const v = Number(e.target.value);
              setHeight(v);
              if (v >= 140 && v <= 220) store(HEIGHT_KEY, v);
            }}
          />
          {t("checklist.cm")}
        </label>
        <dl className="calc__result">
          <div>
            <dt>{t("checklist.seat")}</dt>
            <dd>{d.seat} {t("checklist.cm")}</dd>
          </div>
          <div>
            <dt>{t("checklist.desk")}</dt>
            <dd>{d.desk} {t("checklist.cm")}</dd>
          </div>
          <div>
            <dt>{t("checklist.screenTop")}</dt>
            <dd>{d.screenTop} {t("checklist.cm")}</dd>
          </div>
          <div>
            <dt>{t("checklist.standingDesk")}</dt>
            <dd>{d.standingDesk} {t("checklist.cm")}</dd>
          </div>
        </dl>
        <p className="muted calc__note">{t("checklist.calcNote")}</p>
      </div>
      <ul className="checklist__items">
        {ITEMS.map((id) => (
          <li key={id}>
            <label>
              <input type="checkbox" checked={checked.includes(id)} onChange={() => toggle(id)} />
              <span>{t(`checklist.${id}`)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
