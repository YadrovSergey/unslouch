import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DayStats, Wellbeing, dismissWellbeing, getStats, getWellbeing, keepWellbeingDaily, saveWellbeing } from "../api";
import { WB_AREAS, WbArea, doctorHints, recentAnswers } from "../lib/wellbeing";
import { formatDuration } from "../format";

export type Answers = Record<WbArea, number>;
const UNSET: Answers = { eyes: -1, neck: -1, back: -1, hands: -1 };

/** The evening questions: four areas, 0 (all fine) to 3 (bothers a lot). Yesterday's answers come prefilled, so
 * only what changed needs a click; "Nothing bothers me" saves in one. Today's breaks are shown after the answer,
 * not before, so the numbers don't steer it. Not a medical test.
 * `variant`: on the dark break screen or in the small evening card. `onClose`: after the answer or "Not now".
 * `onTouched`: the answers once the user changed any of them (all four set), null while untouched: the end of
 * day screen saves them when it is left with its own buttons. */
export function WellbeingForm({
  variant,
  weekly,
  offerWeekly,
  day,
  onClose,
  onTouched,
}: {
  variant: "break" | "card";
  weekly: boolean;
  offerWeekly: boolean;
  /** The work day the questions are about. */
  day: string | null;
  onClose: () => void;
  onTouched?: (answers: Answers | null) => void;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Answers>(UNSET);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<{ today: DayStats | null; hints: WbArea[] } | null>(null);
  const [offer, setOffer] = useState(offerWeekly);
  const [prefilled, setPrefilled] = useState(false);
  const statusId = useId();

  useEffect(() => {
    getWellbeing()
      .then((log) => {
        const last = recentAnswers(log, weekly);
        if (last) {
          setAnswers(last);
          setPrefilled(WB_AREAS.some((a) => last[a] >= 0));
        }
      })
      .catch(() => {});
  }, []);

  const pick = (area: WbArea, v: number) => {
    const next = { ...answers, [area]: v };
    setAnswers(next);
    setMissing(false);
    onTouched?.(WB_AREAS.every((a) => next[a] >= 0) ? next : null);
  };

  const save = async (values: Answers) => {
    if (WB_AREAS.some((a) => values[a] < 0)) {
      setMissing(true);
      return;
    }
    const entry: Wellbeing = { ...values, note: "" };
    const log = await saveWellbeing(entry, day).catch(() => null);
    const today = await getStats(1).then((d) => d[0] ?? null, () => null);
    onTouched?.(null);
    setSaved({ today, hints: log ? doctorHints(log, weekly) : [] });
  };

  const later = (weeklyAnswer?: boolean) => dismissWellbeing(weeklyAnswer).finally(onClose);

  const cls = `wbform wbform--${variant}`;
  const button = variant === "break" ? "break__button" : "water__button";

  if (offer) {
    return (
      <div className={cls}>
        <p className="wbform__lead">{t("wellbeing.offerWeekly")}</p>
        <div className="wbform__actions">
          <button className={`${button} ${button}--primary`} onClick={() => later(true)}>
            {t("wellbeing.offerWeeklyYes")}
          </button>
          <button className={button} onClick={() => keepWellbeingDaily().finally(() => setOffer(false))}>
            {t("wellbeing.offerWeeklyNo")}
          </button>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className={cls}>
        <div role="status" className="wbform">
          <p className="wbform__title">{t("wellbeing.saved")}</p>
          {/* After a day without breaks a cold "0" is not what the answer deserves. */}
          {saved.today && saved.today.done > 0 && (
            <p className="wbform__lead">
              {t("wellbeing.todaySummary", { n: saved.today.done, time: formatDuration(saved.today.breakSec ?? 0, true) })}
            </p>
          )}
          {saved.hints.map((a) => (
            <p key={a} className="wbform__doctor">
              {t(`wellbeing.doctorHint.${a}`)}
            </p>
          ))}
          {saved.hints.length > 0 && <p className="wbform__lead">{t("wellbeing.doctorPain")}</p>}
        </div>
        <div className="wbform__actions">
          <button className={`${button} ${button}--primary`} onClick={onClose} autoFocus={variant === "break"}>
            {t("wellbeing.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={cls}
      onSubmit={(e) => {
        e.preventDefault();
        save(answers);
      }}
    >
      <p className="wbform__title">{t(weekly ? "wellbeing.titleWeek" : "wellbeing.title")}</p>
      <p className="wbform__lead">{t(weekly ? "wellbeing.hintWeek" : "wellbeing.hint")}</p>
      {prefilled && <p className="wbform__lead">{t("wellbeing.prefilled")}</p>}
      {WB_AREAS.map((area) => (
        <fieldset key={area} className="wbform__row">
          <legend>{t(`wellbeing.${area}`)}</legend>
          <div className="wbform__scale">
            {[0, 1, 2, 3].map((v) => (
              <label key={v} className={`wbform__option wbform__option--${v}`}>
                <input
                  type="radio"
                  name={`${statusId}-${area}`}
                  value={v}
                  checked={answers[area] === v}
                  onChange={() => pick(area, v)}
                />
                <span>{t(`wellbeing.level${v}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p id={statusId} className={missing ? "wbform__missing" : "sr-only"} role="status">
        {missing ? t("wellbeing.incomplete") : ""}
      </p>
      <div className="wbform__actions">
        <button type="submit" className={`${button} ${button}--primary`} aria-describedby={statusId}>
          {t("wellbeing.save")}
        </button>
        <button type="button" className={button} onClick={() => save({ eyes: 0, neck: 0, back: 0, hands: 0 })}>
          {t("wellbeing.allGood")}
        </button>
        <button type="button" className={button} onClick={() => later()}>
          {t("wellbeing.skip")}
        </button>
      </div>
    </form>
  );
}
