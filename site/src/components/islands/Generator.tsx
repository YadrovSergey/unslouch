import { useEffect, useMemo, useState } from "react";
import { EXERCISES, exerciseSeconds, type Exercise, type Section } from "@app/exercises/catalog";
import type { Dict } from "../../i18n/en";
import { BreakPlayer, ExerciseLoop, mmss, plural, segmentSeconds, store, type IslandText, type Segment } from "./common";

const PARTS: Section[] = ["eyes", "neck", "back", "hands", "legs", "breath"];
const MINUTES = [2, 3, 5, 10];

/** Small deterministic shuffle, so the first render matches the server and "New routine" varies it. */
function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = seed * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildRoutine(parts: Section[], minutes: number, seed: number): Segment[] {
  const target = minutes * 60;
  const lookAway = parts.includes("eyes") ? 20 : 0;
  const pools = parts.map((p) =>
    shuffle(
      EXERCISES.filter((e) => e.section === p && e.id !== "walk"),
      seed + p.length,
    ),
  );
  const picked: Exercise[] = [];
  let total = lookAway;
  let progress = true;
  for (let round = 0; progress && total < target - 10; round++) {
    progress = false;
    for (let i = 0; i < pools.length; i++) {
      const e = pools[(i + seed) % pools.length][round];
      if (!e) continue;
      const sec = exerciseSeconds(e);
      if (total + sec > target + 20) continue;
      picked.push(e);
      total += sec;
      progress = true;
      if (total >= target - 10) break;
    }
  }
  const walk = parts.includes("legs") && target - total >= 40 ? [{ type: "walk", sec: Math.min(120, target - total) } as Segment] : [];
  const segments: Segment[] = [...picked.map((e) => ({ type: "exercise", id: e.id }) as Segment), ...walk];
  if (lookAway) segments.push({ type: "far", sec: lookAway });
  return segments;
}

interface Props {
  text: IslandText;
  t: Dict["tools"]["generator"];
  sections: Record<string, string>;
}

export default function Generator({ text, t, sections }: Props) {
  const [parts, setParts] = useState<Section[]>(["eyes", "neck", "hands"]);
  const [minutes, setMinutes] = useState(3);
  const [seed, setSeed] = useState(0);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    const saved = store.get<{ parts?: Section[]; minutes?: number }>("generator", {});
    if (Array.isArray(saved.parts)) setParts(saved.parts.filter((p) => PARTS.includes(p)));
    if (saved.minutes && MINUTES.includes(saved.minutes)) setMinutes(saved.minutes);
  }, []);
  useEffect(() => store.set("generator", { parts, minutes }), [parts, minutes]);

  const routine = useMemo(() => buildRoutine(parts, minutes, seed), [parts, minutes, seed]);
  const total = routine.reduce((s, x) => s + segmentSeconds(x), 0);
  const toggle = (p: Section) => setParts(parts.includes(p) ? parts.filter((x) => x !== p) : [...parts, p]);

  return (
    <div className="tool generator">
      <fieldset className="chips-field">
        <legend>{t.parts}</legend>
        <div className="chips">
          {PARTS.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={parts.includes(p)} onClick={() => toggle(p)}>
              {sections[p]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="chips-field">
        <legend>{t.minutes}</legend>
        <div className="chips">
          {MINUTES.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m} {plural(text.lang, text.player.min, m)}
            </button>
          ))}
        </div>
      </fieldset>

      {routine.length === 0 ? (
        <p className="tool-note">{t.empty}</p>
      ) : (
        <>
          <h3 className="generator__title">
            {t.list} <span className="muted">· {t.total} {mmss(total)}</span>
          </h3>
          <ol className="routine">
            {routine.map((s, i) => (
              <li key={i} className="routine__item">
                {s.type === "exercise" ? (
                  <>
                    <div className="routine__visual">
                      <ExerciseLoop id={s.id} ex={text.ex} />
                    </div>
                    <div>
                      <b>{text.ex[s.id]?.title}</b>
                      <span className="muted">{mmss(segmentSeconds(s))}</span>
                    </div>
                  </>
                ) : (
                  <div className="routine__plain">
                    <b>{s.type === "far" ? text.player.lookFar : text.player.walk}</b>
                    <span className="muted">{mmss(segmentSeconds(s))}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
              {t.start}
            </button>
            <button type="button" className="btn" onClick={() => setSeed(seed + 1)}>
              {t.build}
            </button>
            <label className="check">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
              {text.player.soundOn}
            </label>
          </div>
        </>
      )}
      {open && <BreakPlayer segments={routine} text={text} sound={sound} onClose={() => setOpen(false)} />}
    </div>
  );
}
