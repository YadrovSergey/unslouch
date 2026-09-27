import { useEffect, useState } from "react";
import { microRotation, type Section } from "@app/exercises/catalog";
import type { Dict } from "../../i18n/en";
import { BreakPlayer, NotifyControl, mmss, notify, plural, store, useNow, useTitleCountdown, type IslandText, type Segment } from "./common";

interface Props {
  text: IslandText;
  t: Dict["browserApp"];
  common: Dict["common"];
  sections: Record<string, string>;
  notifyTitle: string;
  notifyBody: string;
}

interface Settings {
  interval: number;
  look: number;
  parts: Record<"eyes" | "hands" | "neck", boolean>;
  sound: boolean;
}
interface State {
  running: boolean;
  nextAt: number | null;
  pausedLeft: number | null;
  rotation: number;
  day: string;
  count: number;
}

const DEFAULTS: Settings = { interval: 20, look: 20, parts: { eyes: true, hands: true, neck: true }, sound: true };
const today = () => new Date().toISOString().slice(0, 10);
const INITIAL: State = { running: false, nextAt: null, pausedLeft: null, rotation: 0, day: "", count: 0 };

export default function WebApp({ text, t, common, sections, notifyTitle, notifyBody }: Props) {
  const [settings, setSettingsState] = useState<Settings>(DEFAULTS);
  const [state, setStateRaw] = useState<State>(INITIAL);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const s = store.get<Partial<Settings>>("web.settings", {});
    setSettingsState({ ...DEFAULTS, ...s, parts: { ...DEFAULTS.parts, ...(s.parts ?? {}) } });
    const st = { ...INITIAL, ...store.get<Partial<State>>("web.state", {}) };
    if (st.day !== today()) Object.assign(st, { day: today(), count: 0 });
    // The tab was closed for a while: start a fresh interval instead of an instant break.
    if (st.running && (st.nextAt === null || st.nextAt < Date.now() - 60_000)) {
      st.nextAt = Date.now() + (s.interval ?? DEFAULTS.interval) * 60_000;
    }
    setStateRaw(st);
  }, []);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    store.set("web.settings", s);
  };
  const setState = (s: State) => {
    setStateRaw(s);
    store.set("web.state", s);
  };

  const ticking = state.running && state.nextAt !== null && !open;
  const now = useNow(ticking, 500);
  const left = state.nextAt !== null ? (state.nextAt - now) / 1000 : state.pausedLeft ?? settings.interval * 60;
  useTitleCountdown(ticking, left);

  useEffect(() => {
    if (ticking && state.nextAt !== null && now >= state.nextAt) {
      notify(notifyTitle, notifyBody);
      setOpen(true);
    }
  }, [now, ticking]);

  const enabled = Object.fromEntries(
    (["eyes", "neck", "back", "hands", "legs", "breath"] as Section[]).map((s) => [s, s in settings.parts ? settings.parts[s as "eyes"] : false]),
  ) as Record<Section, boolean>;
  const rotation = microRotation(enabled);
  const program: Segment[] = [];
  if (rotation.length) program.push({ type: "exercise", id: rotation[state.rotation % rotation.length].id });
  if (settings.parts.eyes || !rotation.length) program.push({ type: "far", sec: settings.look });

  const start = () =>
    setState({ ...state, running: true, nextAt: Date.now() + (state.pausedLeft ?? settings.interval * 60) * 1000, pausedLeft: null });
  const pause = () => setState({ ...state, running: false, nextAt: null, pausedLeft: Math.max(0, left) });
  const finish = (completed: boolean) => {
    setOpen(false);
    const day = today();
    const count = (state.day === day ? state.count : 0) + (completed ? 1 : 0);
    setState({
      ...state,
      day,
      count,
      rotation: state.rotation + 1,
      nextAt: state.running ? Date.now() + settings.interval * 60_000 : null,
      pausedLeft: state.running ? null : state.pausedLeft,
    });
  };

  return (
    <div className="tool webapp">
      <div className="timer">
        <p className="timer__label">{state.running ? t.next : state.pausedLeft !== null ? t.paused : t.next}</p>
        <p className="timer__value">{mmss(left)}</p>
        <div className="timer__bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, 1 - left / (settings.interval * 60)))})` }} />
        </div>
        <div className="button-row">
          {state.running ? (
            <button type="button" className="btn" onClick={pause}>
              {common.pause}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={start}>
              {state.pausedLeft !== null ? common.resume : common.start}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
            {t.startNow}
          </button>
        </div>
        {state.count > 0 && state.day === today() && (
          <p className="tool-note">
            {t.breaksToday}: <b>{state.count}</b>
          </p>
        )}
      </div>

      <div className="webapp__settings">
        <fieldset className="chips-field">
          <legend>{t.sections}</legend>
          <div className="chips">
            {(["eyes", "hands", "neck"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                aria-pressed={settings.parts[p]}
                onClick={() => setSettings({ ...settings, parts: { ...settings.parts, [p]: !settings.parts[p] } })}
              >
                {sections[p]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="chips-field">
          <legend>{t.interval}</legend>
          <div className="chips">
            {[20, 30, 45].map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                aria-pressed={settings.interval === m}
                onClick={() => {
                  setSettings({ ...settings, interval: m });
                  if (state.running) setState({ ...state, nextAt: Date.now() + m * 60_000 });
                  else setState({ ...state, pausedLeft: null });
                }}
              >
                {m} {common.minutes}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="chips-field">
          <legend>{t.duration}</legend>
          <div className="chips">
            {[20, 30, 60].map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={settings.look === s} onClick={() => setSettings({ ...settings, look: s })}>
                {s} {plural(text.lang, text.player.sec, s)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ ...settings, sound: e.target.checked })} />
          {t.sound}
        </label>
        <NotifyControl
          text={{ on: common.notificationsOn, denied: common.notificationsDenied, ask: common.notificationsAsk, hint: common.notificationsHint }}
        />
        <p className="tool-note">{common.keepOpen}</p>
        <p className="tool-note">{common.stored}</p>
      </div>
      {open && <BreakPlayer segments={program} text={text} sound={settings.sound} onClose={finish} />}
    </div>
  );
}
