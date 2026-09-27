/** Shared pieces for the interactive islands: the looping exercise card, the break player, storage,
 * notifications and plurals. Exercise data and drawings come from the app (../src/exercises). */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { byId, exerciseSeconds, type Exercise } from "@app/exercises/catalog";
import { Visual } from "@app/exercises/Visual";
import { locate } from "@app/exercises/useProgram";
import { playChime, playTick } from "@app/sound";
import type { Dict } from "../../i18n/en";

export type ExTexts = Record<string, Record<string, string>>;
export interface IslandText {
  lang: string;
  ex: ExTexts;
  player: Dict["player"];
}

// ---------- small helpers ----------

export function plural(lang: string, forms: string[], n: number) {
  const rule = new Intl.PluralRules(lang).select(n);
  if (forms.length === 2) return rule === "one" ? forms[0] : forms[1];
  return rule === "one" ? forms[0] : rule === "few" ? forms[1] : rule === "many" ? forms[2] : forms[1];
}

export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** localStorage can be missing or throw (private mode, blocked site data): the tools work without it. */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(`unslouch.${key}`);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.localStorage.setItem(`unslouch.${key}`, JSON.stringify(value));
    } catch {
      /* not critical */
    }
  },
};

/** State that survives a reload when storage works. */
export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    setValue(store.get(key, initial));
    loaded.current = true;
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    store.set(key, v);
  };
  return [value, set];
}

export function chime() {
  try {
    playChime();
  } catch {
    /* audio blocked */
  }
}
function tick() {
  try {
    playTick();
  } catch {
    /* audio blocked */
  }
}

export type Permission = NotificationPermission | "unsupported";
export const notificationState = (): Permission =>
  typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";

export async function askNotifications(): Promise<Permission> {
  if (notificationState() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationState();
  }
}

export function notify(title: string, body: string) {
  try {
    if (notificationState() !== "granted") return;
    const n = new Notification(title, { body, icon: "/icon-192.png", tag: "unslouch" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Notification permission, asked only after a click. */
export function NotifyControl({ text }: { text: { on: string; denied: string; ask: string; hint: string } }) {
  const [state, setState] = useState<Permission>("default");
  useEffect(() => setState(notificationState()), []);
  if (state === "unsupported") return null;
  if (state === "granted") return <p className="tool-note tool-note--ok">{text.on}</p>;
  if (state === "denied") return <p className="tool-note">{text.denied}</p>;
  return (
    <div className="tool-note">
      <button type="button" className="btn btn--small" onClick={async () => setState(await askNotifications())}>
        {text.ask}
      </button>
      <span>{text.hint}</span>
    </div>
  );
}

/** Wall-clock seconds since `start`, ticking while `running`. Uses Date.now so background tabs catch up. */
export function useNow(running: boolean, every = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [running, every]);
  return now;
}

// ---------- looping exercise card ----------

/** Plays one repetition of each exercise over and over, only while it is on screen. */
export function ExerciseLoop({ id, ids, ex, showTitle = false }: { id?: string; ids?: string[]; ex: ExTexts; showTitle?: boolean }) {
  const key = (ids ?? [id ?? "blink"]).join(",");
  const list = useMemo<Exercise[]>(() => key.split(",").map((i) => ({ ...byId(i), reps: 1 })), [key]);
  const cycle = list.reduce((s, e) => s + exerciseSeconds(e), 0);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now() - t * 1000;
    const timer = setInterval(() => setT(((performance.now() - start) / 1000) % cycle), 200);
    return () => clearInterval(timer);
  }, [visible, cycle]);

  const where = locate(list, t) ?? locate(list, 0)!;
  const texts = ex[where.exercise.id] ?? {};
  return (
    <div className="stage" ref={ref}>
      {showTitle && <p className="stage__title">{texts.title}</p>}
      <div className="stage__visual">
        <Visual visual={where.step.visual} />
      </div>
      <p className="stage__step">{texts[where.step.key]}</p>
    </div>
  );
}

// ---------- break player ----------

export type Segment =
  | { type: "exercise"; id: string }
  | { type: "far"; sec: number }
  | { type: "walk"; sec: number }
  | { type: "intro"; title: string; hint?: string; sec: number };

export const segmentSeconds = (s: Segment) => (s.type === "exercise" ? exerciseSeconds(byId(s.id)) : s.sec);

function at(program: Segment[], elapsed: number) {
  let t = elapsed;
  for (let i = 0; i < program.length; i++) {
    const sec = segmentSeconds(program[i]);
    if (t < sec) return { index: i, segment: program[i], t, left: sec - t, sec };
    t -= sec;
  }
  return null;
}

export function Countdown({ progress, children }: { progress: number; children: ReactNode }) {
  const r = 70;
  const length = 2 * Math.PI * r;
  return (
    <div className="countdown">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle className="countdown__track" cx="80" cy="80" r={r} />
        <circle
          className="countdown__bar"
          cx="80"
          cy="80"
          r={r}
          strokeDasharray={length}
          strokeDashoffset={length * Math.min(1, Math.max(0, progress))}
        />
      </svg>
      <div className="countdown__value">{children}</div>
    </div>
  );
}

/** Full-window break screen, like the app's: exercises first, then looking away or walking. */
export function BreakPlayer({
  segments,
  text,
  sound,
  onClose,
}: {
  segments: Segment[];
  text: IslandText;
  sound: boolean;
  onClose: (completed: boolean) => void;
}) {
  const p = text.player;
  const total = segments.reduce((s, x) => s + segmentSeconds(x), 0);
  const [start] = useState(() => Date.now());
  const now = useNow(true, 100);
  const elapsed = (now - start) / 1000;
  const done = elapsed >= total;
  const current = at(segments, elapsed);
  const lastStep = useRef("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const where = current?.segment.type === "exercise" ? locate([byId(current.segment.id)], current.t) : null;
  const stepId = `${current?.index}:${where?.step.key}:${where?.rep}`;
  useEffect(() => {
    if (!sound || !current || stepId === lastStep.current) return;
    const first = lastStep.current === "";
    lastStep.current = stepId;
    if (!first && current.segment.type === "exercise" && byId(current.segment.id).soundSteps) tick();
  }, [stepId]);

  useEffect(() => {
    if (done && sound && segments.some((s) => s.type === "far" || s.type === "walk")) chime();
  }, [done]);

  let body: ReactNode = null;
  if (done || !current) {
    body = <h2 className="player__title">{p.done}</h2>;
  } else {
    const seg = current.segment;
    if (seg.type === "intro") {
      body = (
        <>
          <h2 className="player__title">{seg.title}</h2>
          {seg.hint && <p className="player__hint">{seg.hint}</p>}
        </>
      );
    } else if (seg.type === "far") {
      const left = Math.ceil(current.left);
      body = (
        <>
          <h2 className="player__title">{p.lookFar}</h2>
          <p className="player__hint">{p.lookFarHint}</p>
          <Countdown progress={1 - current.left / current.sec}>
            <b>{left}</b>
            <small>{plural(text.lang, p.sec, left)}</small>
          </Countdown>
        </>
      );
    } else if (seg.type === "walk") {
      body = (
        <>
          <h2 className="player__title">{p.walk}</h2>
          <p className="player__hint">{p.walkHint}</p>
          <div className="player__visual player__visual--small">
            <Visual visual={{ type: "walk" }} />
          </div>
          <Countdown progress={1 - current.left / current.sec}>
            <b>{mmss(current.left)}</b>
          </Countdown>
        </>
      );
    } else if (where) {
      const ex = byId(seg.id);
      const texts = text.ex[seg.id] ?? {};
      body = (
        <>
          <h2 className="player__title player__title--small">{texts.title}</h2>
          <div className="player__visual">
            <Visual visual={where.step.visual} />
          </div>
          <p className="player__step">{texts[where.step.key]}</p>
          <div className="step-bar" aria-hidden="true">
            <span key={stepId} style={{ animationDuration: `${where.step.sec}s` }} />
          </div>
          {ex.reps > 1 && <p className="player__repeat">{fill(p.repeat, { n: where.rep, total: ex.reps })}</p>}
          <p className="player__caution">{p.noPain}</p>
        </>
      );
    }
  }

  return (
    <div className="player" role="dialog" aria-modal="true" aria-label={p.lookFar}>
      <div className="player__center" aria-live="polite">
        {body}
      </div>
      <div className="player__footer">
        <button ref={closeRef} type="button" className="player__button" onClick={() => onClose(done)}>
          {done ? p.close : p.skip}
        </button>
      </div>
      <div className="player__progress" style={{ transform: `scaleX(${Math.min(1, elapsed / total)})` }} />
    </div>
  );
}

/** Shows the countdown in the tab title while a timer runs, so it is visible from other tabs. */
export function useTitleCountdown(running: boolean, left: number) {
  const base = useRef("");
  useEffect(() => {
    base.current = document.title;
    return () => {
      document.title = base.current;
    };
  }, []);
  const shown = Math.ceil(left);
  useEffect(() => {
    if (!base.current) return;
    document.title = running ? `${mmss(shown)} · ${base.current}` : base.current;
  }, [running, shown]);
}
