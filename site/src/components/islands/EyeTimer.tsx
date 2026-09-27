import { useEffect, useState } from "react";
import type { Dict } from "../../i18n/en";
import { BreakPlayer, NotifyControl, mmss, notify, useNow, useTitleCountdown, type IslandText } from "./common";

interface Props {
  text: IslandText;
  t: Dict["tools"]["eyeTimer"];
  common: Dict["common"];
}

const INTERVAL_MIN = 20;
const LOOK_SEC = 20;

export default function EyeTimer({ text, t, common }: Props) {
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [sound, setSound] = useState(true);
  const running = nextAt !== null && !open;
  const now = useNow(running, 500);
  const left = nextAt !== null ? (nextAt - now) / 1000 : pausedLeft ?? INTERVAL_MIN * 60;

  useEffect(() => {
    if (running && nextAt !== null && now >= nextAt) {
      notify(t.notifyTitle, t.notifyBody);
      setOpen(true);
    }
  }, [now, running]);

  useTitleCountdown(running, left);

  const start = () => {
    setNextAt(Date.now() + (pausedLeft ?? INTERVAL_MIN * 60) * 1000);
    setPausedLeft(null);
  };
  const pause = () => {
    setPausedLeft(Math.max(0, left));
    setNextAt(null);
  };
  const reset = () => {
    setNextAt(null);
    setPausedLeft(null);
  };

  const progress = 1 - left / (INTERVAL_MIN * 60);
  return (
    <div className="tool timer">
      <p className="timer__label">{t.next}</p>
      <p className="timer__value" aria-live="off">
        {mmss(left)}
      </p>
      <div className="timer__bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
      </div>
      <div className="button-row">
        {nextAt === null ? (
          <button type="button" className="btn btn--primary" onClick={start}>
            {pausedLeft !== null ? common.resume : common.start}
          </button>
        ) : (
          <button type="button" className="btn" onClick={pause}>
            {common.pause}
          </button>
        )}
        {(nextAt !== null || pausedLeft !== null) && (
          <button type="button" className="btn btn--ghost" onClick={reset}>
            {common.reset}
          </button>
        )}
        <label className="check">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          {text.player.soundOn}
        </label>
      </div>
      {nextAt === null && pausedLeft === null && <p className="tool-note">{t.waiting}</p>}
      <NotifyControl
        text={{ on: common.notificationsOn, denied: common.notificationsDenied, ask: common.notificationsAsk, hint: common.notificationsHint }}
      />
      <p className="tool-note">{common.keepOpen}</p>
      {count > 0 && (
        <p className="tool-note">
          {t.breaksToday}: <b>{count}</b>
        </p>
      )}
      {open && (
        <BreakPlayer
          segments={[{ type: "far", sec: LOOK_SEC }]}
          text={text}
          sound={sound}
          onClose={(completed) => {
            setOpen(false);
            if (completed) setCount((c) => c + 1);
            setNextAt(Date.now() + INTERVAL_MIN * 60 * 1000);
          }}
        />
      )}
    </div>
  );
}
