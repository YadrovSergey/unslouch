import { useEffect, useMemo, useRef, useState } from "react";
import { byId, exerciseSeconds } from "@app/exercises/catalog";
import { Visual } from "@app/exercises/Visual";
import { locate } from "@app/exercises/useProgram";
import { playTick } from "@app/sound";
import type { Dict } from "../../i18n/en";
import { chime, mmss, plural, useNow, type IslandText } from "./common";

interface Props {
  text: IslandText;
  t: Dict["tools"]["breathing"];
  common: Dict["common"];
}

export default function Breathing({ text, t, common }: Props) {
  const [minutes, setMinutes] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  const base = byId("breathing");
  const program = useMemo(() => ({ ...base, reps: base.reps * minutes }), [base, minutes]);
  const total = exerciseSeconds(program);
  const now = useNow(startedAt !== null, 100);
  const elapsed = startedAt !== null ? (now - startedAt) / 1000 : 0;
  const where = startedAt !== null ? locate([program], elapsed) : null;
  const finished = startedAt !== null && !where;
  const last = useRef("");

  const stepId = where ? `${where.rep}:${where.step.key}` : "";
  useEffect(() => {
    if (!where || !sound || stepId === last.current) return;
    const first = last.current === "";
    last.current = stepId;
    if (!first) {
      try {
        playTick();
      } catch {
        /* audio blocked */
      }
    }
  }, [stepId]);
  useEffect(() => {
    if (finished && sound) chime();
  }, [finished]);

  const phase = where?.step.visual.type === "breath" ? where.step.visual.phase : "out";
  return (
    <div className="tool breathing">
      <div className="stage stage--large">
        <div className="stage__visual">
          <Visual visual={{ type: "breath", phase: where ? phase : "out" }} />
        </div>
        <p className="stage__step stage__step--big" aria-live="polite">
          {finished ? t.done : where ? (phase === "in" ? t.in : t.out) : " "}
        </p>
        {where && <p className="stage__count">{Math.ceil(where.stepLeft)}</p>}
      </div>
      <div className="button-row">
        {startedAt === null || finished ? (
          <>
            <span className="chips" role="group" aria-label={t.minutes}>
              {[1, 2, 3].map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                  {m} {plural(text.lang, text.player.min, m)}
                </button>
              ))}
            </span>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                last.current = "";
                setStartedAt(Date.now());
              }}
            >
              {common.start}
            </button>
          </>
        ) : (
          <>
            <span className="muted">{mmss(total - elapsed)}</span>
            <button type="button" className="btn" onClick={() => setStartedAt(null)}>
              {common.stop}
            </button>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          {text.player.soundOn}
        </label>
      </div>
    </div>
  );
}
