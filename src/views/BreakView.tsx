import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AppInfo,
  BreakResult,
  DayStats,
  Wellbeing,
  dismissWellbeing,
  donatePage,
  getAppInfo,
  getStats,
  saveWellbeing,
  sendBreakResult,
} from "../api";
import {
  Exercise,
  byId,
  exerciseSeconds,
  microRotation,
  movementProgram,
} from "../exercises/catalog";
import { Visual } from "../exercises/Visual";
import { locate } from "../exercises/useProgram";
import { playChime, playTick } from "../sound";
import { formatDuration } from "../format";

type Segment =
  | { type: "intro"; sec: number; titleKey: string; hintKey: string }
  | { type: "exercise"; exercise: Exercise; sec: number }
  | { type: "far"; sec: number }
  | { type: "walk"; sec: number };

const DONE_SEC = 2;

/** The break as a list of segments. Exercises go first while the user still looks at the screen; looking into
 * the distance and walking come last, and the chime tells when to come back. */
function buildProgram(
  kind: string,
  dur: number,
  rotation: number,
  info: AppInfo,
): Segment[] {
  const sections = info.settings.sections;
  const ex = (e: Exercise): Segment => ({
    type: "exercise",
    exercise: e,
    sec: exerciseSeconds(e),
  });
  switch (kind) {
    case "micro": {
      const list = microRotation(sections);
      const program: Segment[] = list.length
        ? [ex(list[rotation % list.length])]
        : [];
      if (sections.eyes || !list.length)
        program.push({ type: "far", sec: dur });
      return program;
    }
    case "movement": {
      const exercises = movementProgram(sections, rotation).map(ex);
      const used = exercises.reduce((sum, s) => sum + s.sec, 0) + 4;
      return [
        {
          type: "intro",
          sec: 4,
          titleKey: "break.standUp",
          hintKey: "break.standUpHint",
        },
        ...exercises,
        { type: "walk", sec: Math.max(30, dur - used) },
      ];
    }
    case "long":
      return [
        {
          type: "intro",
          sec: 4,
          titleKey: "break.longTitle",
          hintKey: "break.longHint",
        },
        { type: "walk", sec: Math.max(60, dur - 4) },
      ];
    case "neck":
      return [
        {
          type: "intro",
          sec: 5,
          titleKey: "break.neckTitle",
          hintKey: "break.neckHint",
        },
        ...["lateralRaise", "reverseFly", "shrugHold"].map((id) =>
          ex(byId(id)),
        ),
      ];
    case "breathing":
      return [
        {
          type: "intro",
          sec: 4,
          titleKey: "break.breathTitle",
          hintKey: "break.breathHint",
        },
        ex(byId("breathing")),
      ];
    default:
      return [];
  }
}

function at(program: Segment[], elapsed: number) {
  let t = elapsed;
  for (let i = 0; i < program.length; i++) {
    if (t < program[i].sec)
      return { index: i, segment: program[i], t, left: program[i].sec - t };
    t -= program[i].sec;
  }
  return null;
}

export function BreakView({ params }: { params: URLSearchParams }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getAppInfo().then(setInfo, () => setFailed(true));
  }, []);
  if (failed) {
    // Never leave a dark screen without a way out.
    return (
      <div className="break">
        <main className="break__center">
          <button
            className="break__button"
            onClick={() => sendBreakResult("skipped")}
          >
            {t("break.skip")}
          </button>
        </main>
      </div>
    );
  }
  if (!info) return <div className="break" />;
  return <BreakScreen params={params} info={info} />;
}

function BreakScreen({
  params,
  info,
}: {
  params: URLSearchParams;
  info: AppInfo;
}) {
  const { t } = useTranslation();
  const kind = params.get("kind") ?? "micro";
  const dur = Number(params.get("dur") ?? 20);
  const rotation = Number(params.get("rot") ?? 0);
  const primary = params.get("primary") === "1";
  const sound = params.get("sound") === "1";
  const tipIndex = Number(params.get("tip") ?? 0);

  const program = useMemo(
    () => buildProgram(kind, dur, rotation, info),
    [kind, dur, rotation, info],
  );
  const total = program.reduce((sum, s) => sum + s.sec, 0);

  const [elapsed, setElapsed] = useState(0);
  const [askWellbeing, setAskWellbeing] = useState(false);
  const finished = useRef(false);
  const lastStep = useRef("");

  useEffect(() => {
    if (kind === "endOfDay") return;
    const start = performance.now();
    const id = setInterval(() => {
      const now = (performance.now() - start) / 1000;
      setElapsed(now);
      if (now >= total) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [kind, total]);

  // Esc is the way out on the main monitor, the same as "Skip".
  useEffect(() => {
    if (!primary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish("skipped");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary]);

  const done = kind !== "endOfDay" && elapsed >= total;
  const current = at(program, elapsed);

  const finish = (result: BreakResult) => {
    if (finished.current || !primary) return;
    finished.current = true;
    sendBreakResult(result);
  };

  // Soft tick when a step changes in exercises done with eyes closed or while breathing.
  const stepId =
    current?.segment.type === "exercise"
      ? `${current.index}:${locate([current.segment.exercise], current.t)?.step.key}:${locate([current.segment.exercise], current.t)?.rep}`
      : `${current?.index}`;
  useEffect(() => {
    if (!sound || !current || stepId === lastStep.current) return;
    const first = lastStep.current === "";
    lastStep.current = stepId;
    if (
      !first &&
      current.segment.type === "exercise" &&
      current.segment.exercise.soundSteps
    )
      playTick();
  }, [stepId]);

  useEffect(() => {
    if (!done || !primary) return;
    const lookedAway = program.some(
      (s) => s.type === "far" || s.type === "walk",
    );
    if (sound && lookedAway) playChime();
    // The weekly questions come after any break until answered or put off for today.
    if (info.wellbeingDue) {
      setAskWellbeing(true);
      return;
    }
    const id = setTimeout(() => finish("done"), DONE_SEC * 1000);
    return () => clearTimeout(id);
  }, [done]);

  const tips = t("break.tips", { returnObjects: true }) as string[];
  const tip =
    Array.isArray(tips) && tips.length ? tips[tipIndex % tips.length] : "";

  if (kind === "endOfDay") {
    return (
      <EndOfDay primary={primary} language={info.language} onFinish={finish} />
    );
  }

  return (
    <div className={`break break--${kind} ${done ? "break--done" : ""}`}>
      <Horizon />
      {primary && !done && (
        <Thanks
          language={info.language}
          // The break window covers the screen and the browser would open under it: put the break off, as
          // "Postpone" does, so the page is in front now and the break comes back in a few minutes.
          onOpened={() =>
            finish(
              kind === "micro" || kind === "movement" || kind === "long"
                ? "postponed"
                : "skipped",
            )
          }
        />
      )}
      <main className="break__center">
        {askWellbeing ? (
          <WellbeingQuestions
            onSaved={() => finish("done")}
            onLater={() => dismissWellbeing().finally(() => finish("done"))}
          />
        ) : done || !current ? (
          <h1 className="break__title">{t("break.done")}</h1>
        ) : (
          <SegmentView
            segment={current.segment}
            t={current.t}
            left={current.left}
            primary={primary}
          />
        )}
      </main>
      {primary && !done && (
        <footer className="break__footer">
          {tip && kind !== "breathing" ? (
            <p className="break__tip">
              <span>{t("break.tip")}</span> {tip}
            </p>
          ) : (
            <span />
          )}
          <div className="break__actions">
            {(kind === "micro" || kind === "movement" || kind === "long") && (
              <button
                className="break__button"
                onClick={() => finish("postponed")}
              >
                {t("break.postpone", { n: info.settings.snoozeMin })}
              </button>
            )}
            <button className="break__button" onClick={() => finish("skipped")}>
              {t("break.skip")}
            </button>
          </div>
        </footer>
      )}
      <div
        className="break__progress"
        style={{
          transform: `scaleX(${total > 0 ? Math.min(1, elapsed / total) : 1})`,
        }}
      />
    </div>
  );
}

function SegmentView({
  segment,
  t: segT,
  left,
  primary,
}: {
  segment: Segment;
  t: number;
  left: number;
  primary: boolean;
}) {
  const { t } = useTranslation();
  switch (segment.type) {
    case "intro":
      return (
        <>
          <h1 className="break__title">{t(segment.titleKey)}</h1>
          {primary && <p className="break__hint">{t(segment.hintKey)}</p>}
        </>
      );
    case "far":
      return (
        <>
          <h1 className="break__title">{t("break.lookFar")}</h1>
          {primary && <p className="break__hint">{t("break.lookFarHint")}</p>}
          <Countdown progress={1 - left / segment.sec}>
            <b>{Math.ceil(left)}</b>
            <small>{t("break.seconds", { count: Math.ceil(left) })}</small>
          </Countdown>
        </>
      );
    case "walk":
      return (
        <>
          <h1 className="break__title">{t("ex.walk.title")}</h1>
          {primary && <p className="break__hint">{t("break.walkHint")}</p>}
          <div className="break__visual break__visual--small">
            <Visual visual={{ type: "walk" }} />
          </div>
          <Countdown progress={1 - left / segment.sec}>
            <b>{formatDuration(Math.ceil(left))}</b>
            <small>{t("break.minutes", { count: Math.ceil(left / 60) })}</small>
          </Countdown>
        </>
      );
    case "exercise": {
      const where = locate([segment.exercise], segT);
      if (!where) return null;
      const id = segment.exercise.id;
      return (
        <>
          <h1 className="break__title break__title--small">
            {t(`ex.${id}.title`)}
          </h1>
          <div className="break__visual">
            <Visual visual={where.step.visual} />
          </div>
          <p className="break__step">{t(`ex.${id}.${where.step.key}`)}</p>
          <div className="step-bar" aria-hidden="true">
            <span
              key={`${where.rep}-${where.stepIndex}`}
              style={{ animationDuration: `${where.step.sec}s` }}
            />
          </div>
          {segment.exercise.reps > 1 && (
            <p className="break__repeat">
              {t("break.repeat", {
                n: where.rep,
                total: segment.exercise.reps,
              })}
            </p>
          )}
          {primary && <p className="break__caution">{t("break.noPain")}</p>}
        </>
      );
    }
  }
}

function Countdown({
  progress,
  children,
}: {
  progress: number;
  children: React.ReactNode;
}) {
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

/** Weekly self-check: four questions, 0 (fine) to 3 (bothers a lot). Not a medical test. */
function WellbeingQuestions({
  onSaved,
  onLater,
}: {
  onSaved: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Wellbeing>({
    eyes: -1,
    neck: -1,
    back: -1,
    hands: -1,
  } as Wellbeing);
  const keys = ["eyes", "neck", "back", "hands"] as const;
  const complete = keys.every((k) => answers[k] >= 0);
  return (
    <div className="wellbeing">
      <h1 className="break__title break__title--small">
        {t("wellbeing.title")}
      </h1>
      <p className="break__hint">{t("wellbeing.hint")}</p>
      {keys.map((k) => (
        <div className="wellbeing__row" key={k}>
          <span>{t(`wellbeing.${k}`)}</span>
          <div
            className="wellbeing__scale"
            role="radiogroup"
            aria-label={t(`wellbeing.${k}`)}
          >
            {[0, 1, 2, 3].map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={answers[k] === v}
                className="wellbeing__option"
                onClick={() => setAnswers({ ...answers, [k]: v })}
              >
                {t(`wellbeing.level${v}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="break__actions">
        <button className="break__button" onClick={onLater}>
          {t("wellbeing.skip")}
        </button>
        <button
          className="break__button break__button--primary"
          disabled={!complete}
          onClick={() => saveWellbeing(answers).finally(onSaved)}
        >
          {t("wellbeing.save")}
        </button>
      </div>
    </div>
  );
}

/** "Say thanks" in the top right corner of the break screen: opens the site's support page. */
function Thanks({
  language,
  onOpened,
}: {
  language: string;
  onOpened: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      className="break__thanks"
      onClick={() => {
        openUrl(donatePage(language));
        onOpened();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
      {t("tabs.thanks")}
    </button>
  );
}

function EndOfDay({
  primary,
  language,
  onFinish,
}: {
  primary: boolean;
  language: string;
  onFinish: (r: BreakResult) => void;
}) {
  const { t } = useTranslation();
  const [today, setToday] = useState<DayStats | null>(null);
  useEffect(() => {
    getStats(1).then((d) => setToday(d[0] ?? null));
  }, []);
  return (
    <div className="break break--endOfDay">
      <Horizon />
      {primary && (
        <Thanks language={language} onOpened={() => onFinish("skipped")} />
      )}
      <main className="break__center">
        <h1 className="break__title">{t("endOfDay.title")}</h1>
        {primary && <p className="break__hint">{t("endOfDay.hint")}</p>}
        {today && (
          <div className="break__summary">
            <div>
              <b>{today.done}</b>
              <span>{t("endOfDay.breaks")}</span>
            </div>
            <div>
              <b>{formatDuration(today.activeSec, true)}</b>
              <span>{t("endOfDay.atComputer")}</span>
            </div>
            <div>
              <b>{formatDuration(today.longestSittingSec, true)}</b>
              <span>{t("endOfDay.longestSitting")}</span>
            </div>
          </div>
        )}
        {primary && (
          <div className="break__actions">
            <button
              className="break__button"
              onClick={() => onFinish("skipped")}
            >
              {t("endOfDay.continue")}
            </button>
            <button
              className="break__button break__button--primary"
              onClick={() => onFinish("done")}
            >
              {t("endOfDay.finish")}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/** Calm hills fading into the distance: the picture itself says "look far". */
function Horizon() {
  return (
    <svg
      className="horizon"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 70 Q15 60 30 66 T60 62 T100 68 V100 H0 Z"
        className="horizon__hill horizon__hill--0"
      />
      <path
        d="M0 78 Q20 70 40 76 T75 72 T100 78 V100 H0 Z"
        className="horizon__hill horizon__hill--1"
      />
      <path
        d="M0 86 Q25 80 50 86 T100 84 V100 H0 Z"
        className="horizon__hill horizon__hill--2"
      />
    </svg>
  );
}
