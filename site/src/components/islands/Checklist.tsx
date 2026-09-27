import { useEffect, useState } from "react";
import type { Dict } from "../../i18n/en";
import { fill, store } from "./common";

interface Props {
  items: { key: string; text: string }[];
  t: Dict["tools"]["checklist"];
}

export default function Checklist({ items, t }: Props) {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(store.get<string[]>("checklist", [])), []);
  const toggle = (key: string) => {
    const next = done.includes(key) ? done.filter((k) => k !== key) : [...done, key];
    setDone(next);
    store.set("checklist", next);
  };
  const count = items.filter((i) => done.includes(i.key)).length;
  return (
    <div className="tool checklist">
      <ul className="checklist__items">
        {items.map((i) => (
          <li key={i.key}>
            <label>
              <input type="checkbox" checked={done.includes(i.key)} onChange={() => toggle(i.key)} />
              <span>{i.text}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="checklist__footer">
        <span className="muted">{fill(t.done, { n: count, total: items.length })}</span>
        {count > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setDone([]);
              store.set("checklist", []);
            }}
          >
            {t.reset}
          </button>
        )}
      </div>
    </div>
  );
}
