import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { closeCue, cueReady, getAppInfo, reminderAnswer, waterDrunk } from "../api";
import { playCue } from "../sound";

const WATER_VISIBLE_MS = 15000;
const MZR_WATER_URL = "https://health-diet.ru/?utm_source=unslouch&utm_medium=app&utm_campaign=unslouch&utm_content=water";

/** Gentle cues. Blink and posture live in a transparent click-through window; water is a small card. */
export function CueView({ params }: { params: URLSearchParams }) {
  const cue = params.get("cue") ?? "blink";
  const sound = params.get("sound") === "1";
  useEffect(() => {
    if (sound) playCue();
    // Cue windows are shown right away by Rust; this only matters for a window that was left hidden.
    cueReady();
  }, [sound]);
  if (cue === "water") return <WaterCard cis={params.get("cis") === "1"} />;
  if (cue === "reminder") return <ReminderCard id={params.get("rid") ?? ""} preview={params.get("preview") === "1"} />;
  return <EdgeCue cue={cue} sec={Number(params.get("sec") ?? 4)} />;
}

function EdgeCue({ cue, sec }: { cue: string; sec: number }) {
  const { t } = useTranslation();
  return (
    <div
      className={`cue cue--${cue}`}
      style={cue === "blink" ? { animationDuration: `${sec}s` } : undefined}
      onAnimationEnd={(e) => e.target === e.currentTarget && closeCue()}
    >
      <div className="cue__pill">
        {cue === "blink" ? (
          <svg viewBox="0 0 40 20" aria-hidden="true">
            <path d="M2 8 Q20 22 38 8" />
            <path d="M10 14 l-3 5 M20 17 v5 M30 14 l3 5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="4" r="2.4" />
            <path d="M12 7.5 v8 M7 11 l5 -2 l5 2 M12 15.5 l-3 6 M12 15.5 l3 6" />
          </svg>
        )}
        {t(cue === "blink" ? "cue.blink" : "cue.posture")}
      </div>
    </div>
  );
}

function WaterCard({ cis }: { cis: boolean }) {
  const { t } = useTranslation();
  useEffect(() => {
    const id = setTimeout(() => closeCue(), WATER_VISIBLE_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="water">
      <svg className="water__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3 h12 l-1.6 17 a2 2 0 0 1 -2 1.8 h-4.8 a2 2 0 0 1 -2 -1.8 z" />
        <path className="water__level" d="M7 10 h10 l-1 10 a1.4 1.4 0 0 1 -1.4 1.3 h-5.2 a1.4 1.4 0 0 1 -1.4 -1.3 z" />
      </svg>
      <div className="water__body">
        <b>{t("cue.water")}</b>
        <div className="water__actions">
          <button className="water__button water__button--primary" onClick={() => waterDrunk()}>
            {t("cue.drank")}
          </button>
          {cis && (
            <button
              className="water__button"
              onClick={() => {
                openUrl(MZR_WATER_URL);
                waterDrunk();
              }}
            >
              {t("cue.logInMzr")}
            </button>
          )}
          <button className="water__button" aria-label={t("cue.close")} onClick={() => closeCue()}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

const LATER_MIN = 10;

/** A reminder of the user's own: stays until answered. The title comes from the settings. */
/** `preview`: opened by "Show" in the settings; its buttons only close it and leave the schedule alone. */
function ReminderCard({ id, preview }: { id: string; preview: boolean }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  useEffect(() => {
    getAppInfo()
      .then((info) => setTitle(info.settings.reminders.find((r) => r.id === id)?.title ?? ""))
      .catch(() => {});
  }, [id]);
  return (
    <div className="water reminder">
      <svg className="water__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 16 V11 a6 6 0 0 1 12 0 v5 l1.5 2 h-15 z" />
        <path d="M10 20.5 a2 2 0 0 0 4 0" />
      </svg>
      <div className="water__body">
        <b className="reminder__title">{title || t("reminders.untitled")}</b>
        <div className="water__actions">
          <button className="water__button water__button--primary" onClick={() => (preview ? closeCue() : reminderAnswer(id))}>
            {t("reminders.done")}
          </button>
          <button className="water__button" onClick={() => (preview ? closeCue() : reminderAnswer(id, LATER_MIN))}>
            {t("reminders.later", { n: LATER_MIN })}
          </button>
        </div>
      </div>
    </div>
  );
}
