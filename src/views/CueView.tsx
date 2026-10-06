import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppInfo, DayStats, Wellbeing, closeCue, cueReady, getAppInfo, getStats, getWellbeing, hideSummary, openResult, reminderAnswer, waterDrunk } from "../api";
import { WellbeingForm } from "./WellbeingForm";
import { streak } from "../lib/achievements";
import { betterArea, neckProgress, weekSoFar } from "../lib/summary";
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
  if (cue === "wellbeing") return <WellbeingCard />;
  if (cue === "done") return <DoneCard kind={params.get("kind") ?? "micro"} full={params.get("full") === "1"} day={params.get("day")} />;
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

/** Seconds the summary stays when nobody touches it; while the pointer is over it, it waits. */
const DONE_FULL_SEC = 10;
const DONE_SHORT_SEC = 3;
/** The streak shows from this many days: a short one breaking would feel like a loss. */
const STREAK_FROM = 3;
/** Lines beyond the main ones: more would not fit the card in longer languages, and wouldn't be read. */
const DONE_EXTRA_LINES = 2;
/** "Bothers you less" is said once a day: repeated on every card it would turn into noise. */
const BETTER_KEY = "unslouch.summaryBetterDay";

function betterShownToday(): boolean {
  const today = new Date().toDateString();
  try {
    if (localStorage.getItem(BETTER_KEY) === today) return true;
    localStorage.setItem(BETTER_KEY, today);
  } catch {
    // Without storage the line may come on every card of the day: harmless.
  }
  return false;
}

/** After "Done": what the user just did, in today's numbers. One line after the eye and breathing breaks; after a
 * stand-up break or the neck minutes (a few times a day at most, Rust decides) that exercise, and at most two of:
 * a new neck step, a word from the evening answers if they got better, the week ahead of the same days last week,
 * a quiet streak. Nothing is asked here and nothing compares the user downwards. It closes by itself; the pointer
 * over it or a click keeps it. */
/** `day`: the day the break counts for ("2026-10-06"): after midnight it is still the day the break started. */
function DoneCard({ kind, full, day }: { kind: string; full: boolean; day: string | null }) {
  const { t } = useTranslation();
  const [days, setDays] = useState<DayStats[] | null>(null);
  const [log, setLog] = useState<Record<string, Wellbeing>>({});
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState(false);
  const [better, setBetter] = useState<ReturnType<typeof betterArea>>(null);
  useEffect(() => {
    // The streak needs the whole history; one line needs only today (and yesterday, after midnight).
    getStats(full ? 400 : 2).then((all) => {
      const upTo = day ? all.findIndex((d) => d.day === day) : -1;
      setDays(upTo >= 0 ? all.slice(0, upTo + 1) : all);
    }, () => closeCue());
    if (full) getWellbeing().then(setLog, () => {});
  }, []);
  useEffect(() => {
    const area = betterArea(log);
    if (area && !betterShownToday()) setBetter(area);
  }, [log]);
  useEffect(() => {
    if (held || hover) return;
    const id = setTimeout(() => closeCue(), (full ? DONE_FULL_SEC : DONE_SHORT_SEC) * 1000);
    return () => clearTimeout(id);
  }, [held, hover]);
  const today = days?.[days.length - 1];

  // The announcement region exists from the start, so a screen reader hears the sentence when it is filled in.
  const announce = (
    <div className="sr-only" role="status" aria-live="polite">
      {today ? t("summary.short", { n: today.done }) : ""}
    </div>
  );
  if (!days || !today) return announce;

  if (!full) {
    return (
      <div className="water done done--short">
        {announce}
        <b aria-hidden="true">{t("summary.short", { n: today.done })}</b>
      </div>
    );
  }

  const neck = kind === "neck" ? neckProgress(days) : null;
  const week = weekSoFar(days);
  const run = streak(days);
  const stoodUp = (today.kinds?.movement.done ?? 0) + (today.kinds?.long.done ?? 0);
  const extra = [
    neck?.levelUp && <p className="done__news">{t("summary.neckStep")}</p>,
    better && <p className="done__news">{t(`summary.better.${better}`)}</p>,
    neck && !neck.levelUp && neck.toNext != null && <p className="muted">{t("summary.neckToNext", { n: neck.toNext })}</p>,
    week.comparable && week.now > week.then && week.then > 0 && (
      <p className="muted">{t("summary.weekAhead", { now: week.now, then: week.then })}</p>
    ),
    run >= STREAK_FROM && <p className="muted">{t("summary.streak", { n: run })}</p>,
  ]
    .filter(Boolean)
    .slice(0, DONE_EXTRA_LINES);
  return (
    <div
      className="water done"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={() => setHeld(true)}
      onFocus={() => setHeld(true)}
    >
      {announce}
      <button className="done__close" aria-label={t("cue.close")} onClick={() => closeCue()}>
        ✕
      </button>
      <div className="done__body">
        <p className="done__title">{t(`summary.title.${kind}`)}</p>
        <p className="done__big">
          <span>{t("summary.today")}</span> <b>{today.done}</b>
        </p>
        {neck && <p>{t("summary.neckWeek", { n: neck.thisWeek })}</p>}
        {(kind === "movement" || kind === "long") && <p>{t("summary.stoodUp", { n: stoodUp })}</p>}
        {extra.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div className="water__actions">
          <button className="water__button" onClick={() => openResult()}>
            {t("summary.all")}
          </button>
          <button className="water__button" onClick={() => hideSummary()}>
            {t("summary.hide")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The evening questions in a card in the corner. It never takes the focus: the user may be typing. */
function WellbeingCard() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    getAppInfo().then(setInfo, () => closeCue());
  }, []);
  if (!info) return null;
  return (
    <div className="water wbcard">
      <WellbeingForm
        variant="card"
        weekly={info.settings.wellbeingEvery === "week"}
        offerWeekly={info.wellbeingOfferWeekly}
        day={info.wellbeingDay}
        onClose={() => closeCue()}
      />
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
