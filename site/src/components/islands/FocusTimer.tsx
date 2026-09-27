import { useEffect, useMemo, useState } from "react";
import type { Dict } from "../../i18n/en";
import { BreakPlayer, NotifyControl, chime, mmss, notify, useNow, useTitleCountdown, type IslandText } from "./common";
import { buildRoutine } from "./Generator";

interface Props {
  text: IslandText;
  t: Dict["tools"]["focus"];
  common: Dict["common"];
}

const FOCUS = [25, 50];
const BREAK = [5, 10];

export default function FocusTimer({ text, t, common }: Props) {
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [sound, setSound] = useState(true);

  const running = endsAt !== null;
  const now = useNow(running, 500);
  const left = endsAt !== null ? (endsAt - now) / 1000 : pausedLeft ?? focusMin * 60;
  useTitleCountdown(running, left);

  useEffect(() => {
    if (endsAt !== null && now >= endsAt) {
      setEndsAt(null);
      setSessions((s) => s + 1);
      setReady(true);
      notify(t.notifyTitle, t.notifyBody);
      if (sound) chime();
    }
  }, [now]);

  const routine = useMemo(
    () => buildRoutine(["eyes", "neck", "hands", "back", "legs"], breakMin, sessions),
    [breakMin, sessions],
  );

  const startFocus = () => {
    setReady(false);
    setEndsAt(Date.now() + (pausedLeft ?? focusMin * 60) * 1000);
    setPausedLeft(null);
  };

  return (
    <div className="tool timer">
      {!running && pausedLeft === null && !ready && (
        <div className="timer__options">
          <fieldset className="chips-field">
            <legend>{t.focusMin}</legend>
            <div className="chips">
              {FOCUS.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={focusMin === m} onClick={() => setFocusMin(m)}>
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="chips-field">
            <legend>{t.breakMin}</legend>
            <div className="chips">
              {BREAK.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={breakMin === m} onClick={() => setBreakMin(m)}>
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {ready ? (
        <div className="timer__ready">
          <p className="timer__label">{t.breakReady}</p>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
              {t.startBreak}
            </button>
            <button type="button" className="btn" onClick={startFocus}>
              {t.skipBreak}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="timer__label">
            {t.focus} · {t.nextBreak}
          </p>
          <p className="timer__value">{mmss(left)}</p>
          <div className="timer__bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, 1 - left / (focusMin * 60)))})` }} />
          </div>
          <div className="button-row">
            {running ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPausedLeft(Math.max(0, left));
                  setEndsAt(null);
                }}
              >
                {common.pause}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={startFocus}>
                {pausedLeft !== null ? common.resume : common.start}
              </button>
            )}
            {(running || pausedLeft !== null) && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEndsAt(null);
                  setPausedLeft(null);
                }}
              >
                {common.reset}
              </button>
            )}
            <label className="check">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
              {text.player.soundOn}
            </label>
          </div>
        </>
      )}
      <NotifyControl
        text={{ on: common.notificationsOn, denied: common.notificationsDenied, ask: common.notificationsAsk, hint: common.notificationsHint }}
      />
      <p className="tool-note">{common.keepOpen}</p>
      {sessions > 0 && (
        <p className="tool-note">
          {t.sessions}: <b>{sessions}</b>
        </p>
      )}
      {open && (
        <BreakPlayer
          segments={routine}
          text={text}
          sound={sound}
          onClose={() => {
            setOpen(false);
            startFocus();
          }}
        />
      )}
    </div>
  );
}
