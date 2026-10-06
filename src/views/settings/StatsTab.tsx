import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  AppInfo,
  BREAK_KINDS,
  BreakKind,
  DayStats,
  DayUsage,
  SettingsPatch,
  Wellbeing,
  deleteWellbeing,
  getStats,
  getUsage,
  getResult,
  getWellbeing,
  ResultView,
  savePng,
  setWellbeing,
  startBreak,
} from "../../api";
import { WB_AREAS } from "../../lib/wellbeing";
import { achievements, streak } from "../../lib/achievements";
import { Category, appCategory, appName } from "../../lib/apps";
import { formatDuration } from "../../format";
import { Section } from "./ui";

type Sub = "overview" | "result" | "apps" | "wellbeing" | "achievements";
const SUBS: Sub[] = ["overview", "result", "apps", "wellbeing", "achievements"];
const isSub = (id: string | null): id is Sub => (SUBS as (string | null)[]).includes(id);
const SITTING_RISK_SEC = 2 * 3600;
/** Periods to look at. Usage by program is kept 90 days, so "year" is only for the day stats. */
const PERIODS = [7, 30, 90, 365] as const;
type Period = (typeof PERIODS)[number];

/** `open`: the page asked for in the address ("#stats/wellbeing" from the tray); `n` changes on every visit. */
export function StatsTab({
  info,
  update,
  open,
}: {
  info: AppInfo;
  update: (p: SettingsPatch) => void;
  open?: { id: string | null; n: number };
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<Sub>(isSub(open?.id ?? null) ? (open!.id as Sub) : "overview");
  useEffect(() => {
    if (open && isSub(open.id)) setSub(open.id);
  }, [open?.n]);
  const [days, setDays] = useState<DayStats[]>([]);
  useEffect(() => {
    // All kept history (400 days): achievements are counted over it, the heatmap shows the last year.
    getStats(400).then(setDays);
  }, []);

  return (
    <>
      <div className="segmented" role="tablist">
        {SUBS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={sub === id}
            onClick={() => {
              setSub(id);
              window.location.hash = id === "overview" ? "stats" : `stats/${id}`;
            }}
          >
            {t(`stats.tabs.${id}`)}
          </button>
        ))}
      </div>
      {sub === "overview" && <Overview days={days} nightShift={info.settings.workHoursEnabled && info.settings.workStart > info.settings.workEnd} />}
      {sub === "result" && <ResultPage info={info} />}
      {sub === "apps" && <Apps info={info} update={update} days={days} />}
      {sub === "wellbeing" && <WellbeingPage />}
      {sub === "achievements" && <Achievements days={days} />}
    </>
  );
}

function PeriodPicker({ value, onChange, options }: { value: number; onChange: (p: Period) => void; options: readonly Period[] }) {
  const { t } = useTranslation();
  return (
    <div className="segmented segmented--small" role="tablist" aria-label={t("stats.period")}>
      {options.map((p) => (
        <button key={p} role="tab" aria-selected={value === p} onClick={() => onChange(p)}>
          {t(`stats.periods.${p}`)}
        </button>
      ))}
    </div>
  );
}

/** Long totals in whole hours ("152 h"): "152 h 30 min" doesn't fit a tile. */
function bigDuration(sec: number, locale: string): string {
  if (sec < 10 * 3600) return formatDuration(sec, true);
  return new Intl.NumberFormat(locale, { style: "unit", unit: "hour", unitDisplay: "short", maximumFractionDigits: 0 }).format(sec / 3600);
}

/** "9:05" from minutes after midnight. */
const clock = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

/** `nightShift`: work hours go over midnight, so start and end by calendar day would mislead: they are hidden. */
function Overview({ days, nightShift }: { days: DayStats[]; nightShift: boolean }) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<Period>(7);
  if (!days.length) return null;
  const today = days[days.length - 1];
  const range = days.slice(-period);
  const worked = range.filter((d) => d.activeSec > 0);
  const total = range.reduce((s, d) => s + d.activeSec, 0);
  const done = range.reduce((s, d) => s + d.done, 0);
  const offered = done + range.reduce((s, d) => s + d.skipped, 0);
  const starts = worked.map((d) => d.firstActiveMin).filter((m): m is number => m != null);
  const ends = worked.map((d) => d.lastActiveMin).filter((m): m is number => m != null);
  const start = nightShift ? null : median(starts);
  const end = nightShift ? null : median(ends);
  const longDays = range.filter((d) => d.longestSittingSec >= SITTING_RISK_SEC).length;
  const empty = days.every((d) => d.activeSec === 0);

  return (
    <>
      <Section title={t("stats.today")}>
        <div className="stat-tiles">
          <Tile label={t("stats.done")} value={String(today.done)} />
          <Tile label={t("stats.atComputer")} value={formatDuration(today.activeSec, true)} />
          <Tile
            label={t("stats.longestSitting")}
            value={formatDuration(today.longestSittingSec, true)}
            warn={today.longestSittingSec >= SITTING_RISK_SEC}
          />
          <Tile label={t("stats.streak")} value={String(streak(days))} />
        </div>
        {!nightShift && today.firstActiveMin != null && today.lastActiveMin != null && (
          <p className="muted">
            {t("stats.workedToday", {
              start: clock(today.firstActiveMin),
              end: clock(today.lastActiveMin),
            })}
          </p>
        )}
        {today.longestSittingSec >= SITTING_RISK_SEC && <p className="notice">{t("stats.sittingWarning")}</p>}
      </Section>

      <Section title={t("stats.periodTitle")} aside={<PeriodPicker value={period} onChange={setPeriod} options={PERIODS} />}>
        {empty ? (
          <p className="muted">{t("stats.empty")}</p>
        ) : (
          <>
            <div className="stat-tiles">
              <Tile label={t("stats.atComputer")} value={bigDuration(total, i18n.language)} />
              <Tile label={t("stats.perDay")} value={worked.length ? formatDuration(Math.round(total / worked.length), true) : "–"} />
              <Tile
                label={offered ? `${t("stats.breaksDone")} · ${Math.round((done / offered) * 100)}%` : t("stats.breaksDone")}
                value={String(done)}
              />
              {/* A zero-width space after the dash: "10:23–18:40" wraps there when the tile is narrow. */}
              <Tile label={t("stats.usualDay")} value={start != null && end != null ? `${clock(start)}–\u200b${clock(end)}` : "–"} range />
              <Tile label={t("stats.longDays")} value={String(longDays)} warn={longDays > 0} />
            </div>
            <h3 className="chart-title">{t("stats.timeByDay")}</h3>
            <TimeBars days={range} period={period} locale={i18n.language} />
            {period <= 30 && starts.length > 0 && !nightShift && (
              <>
                <h3 className="chart-title">{t("stats.workday")}</h3>
                <WorkdayRanges days={range} locale={i18n.language} />
              </>
            )}
            {period <= 30 && (
              <>
                <h3 className="chart-title">{t("stats.breaksByDay")}</h3>
                <BreakBars days={range} locale={i18n.language} />
              </>
            )}
          </>
        )}
      </Section>

      <Section title={t("stats.year")}>
        <Heatmap days={days.slice(-371)} />
      </Section>
    </>
  );
}

/** Minutes at the computer per day; for 3 months and a year, per week. */
function TimeBars({ days, period, locale }: { days: DayStats[]; period: Period; locale: string }) {
  const { t } = useTranslation();
  const weekly = period > 30;
  const buckets = useMemo(() => {
    if (!weekly) return days.map((d) => ({ key: d.day, sec: d.activeSec, day: d.day }));
    // Weeks counted back from today, so the last bar is a full week and not a lone day.
    const out: { key: string; sec: number; day: string }[] = [];
    for (let end = days.length; end > 0; end -= 7) {
      const week = days.slice(Math.max(0, end - 7), end);
      out.unshift({ key: week[0].day, sec: week.reduce((s, d) => s + d.activeSec, 0), day: week[0].day });
    }
    return out;
  }, [days, weekly]);
  const max = Math.max(1, ...buckets.map((b) => b.sec));
  // A week: weekdays. A month: day numbers, every fifth. Weeks of 3 months or a year: the date, a few of them.
  const short = new Intl.DateTimeFormat(
    locale,
    period === 7 ? { weekday: "short" } : period === 30 ? { day: "numeric" } : { day: "numeric", month: "short" },
  );
  const labelEvery = period === 7 ? 1 : period === 30 ? 5 : Math.ceil(buckets.length / 4);
  return (
    <div className="bars" role="img" aria-label={t("stats.timeByDay")}>
      {buckets.map((b, i) => (
        <div key={b.key} className="bars__col" title={`${short.format(new Date(`${b.day}T12:00:00`))}: ${formatDuration(b.sec, true)}`}>
          <div className="bars__track">
            <span style={{ height: `${(b.sec / max) * 100}%` }} />
          </div>
          <small>{i % labelEvery === 0 ? short.format(new Date(`${b.day}T12:00:00`)) : " "}</small>
        </div>
      ))}
    </div>
  );
}

/** When work started and ended each day, on a common time axis. */
function WorkdayRanges({ days, locale }: { days: DayStats[]; locale: string }) {
  const known = days.filter((d) => d.firstActiveMin != null && d.lastActiveMin != null);
  const from = Math.floor(Math.min(...known.map((d) => d.firstActiveMin!)) / 60) * 60;
  const to = Math.ceil(Math.max(...known.map((d) => d.lastActiveMin!)) / 60) * 60;
  const span = Math.max(60, to - from);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
  });
  return (
    <div className="workday">
      {known.map((d) => (
        <div key={d.day} className="workday__row">
          <small>{date.format(new Date(`${d.day}T12:00:00`))}</small>
          <div className="workday__track">
            {d.firstActiveMin != null && d.lastActiveMin != null && (
              <span
                style={{
                  left: `${((d.firstActiveMin - from) / span) * 100}%`,
                  width: `${Math.max(1, ((d.lastActiveMin - d.firstActiveMin) / span) * 100)}%`,
                }}
                title={`${clock(d.firstActiveMin)}–${clock(d.lastActiveMin)}`}
              />
            )}
          </div>
        </div>
      ))}
      <div className="workday__axis">
        <small />
        <div>
          <small>{clock(from)}</small>
          <small>{clock(from + Math.round(span / 2 / 60) * 60)}</small>
          <small>{clock(to)}</small>
        </div>
      </div>
    </div>
  );
}

function BreakBars({ days, locale }: { days: DayStats[]; locale: string }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...days.map((d) => d.done + d.skipped));
  const short = new Intl.DateTimeFormat(locale, days.length <= 7 ? { weekday: "short" } : { day: "numeric" });
  return (
    <>
      <div
        className="week"
        role="img"
        aria-label={t("stats.breaksByDay")}
        style={{
          gridTemplateColumns: `repeat(${days.length}, 1fr)`,
          gap: days.length > 7 ? 2 : 8,
        }}
      >
        {days.map((d, i) => (
          <div className="week__day" key={d.day} title={`${t("stats.done")}: ${d.done}, ${t("stats.skipped")}: ${d.skipped}`}>
            <div className="week__bar">
              <div className="week__skipped" style={{ height: `${(d.skipped / max) * 100}%` }} />
              <div className="week__done" style={{ height: `${(d.done / max) * 100}%` }} />
            </div>
            <span className="week__label">{days.length <= 7 || i % 5 === 0 ? short.format(new Date(`${d.day}T12:00:00`)) : " "}</span>
          </div>
        ))}
      </div>
      <div className="legend">
        <span className="legend__item legend__item--done">{t("stats.done")}</span>
        <span className="legend__item legend__item--skipped">{t("stats.skipped")}</span>
      </div>
    </>
  );
}

/** 53 weeks × 7 days, the color shows how many breaks were done. */
function Heatmap({ days }: { days: DayStats[] }) {
  const { t, i18n } = useTranslation();
  const cells = useMemo(() => {
    // Align the first column to a Monday.
    const first = new Date(`${days[0]?.day}T12:00:00`);
    const pad = (first.getDay() + 6) % 7;
    return [...Array(pad).fill(null), ...days];
  }, [days]);
  const level = (d: DayStats) => (d.done === 0 ? 0 : d.done < 5 ? 1 : d.done < 10 ? 2 : d.done < 16 ? 3 : 4);
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
  });
  return (
    <>
      <div className="heatmap" role="img" aria-label={t("stats.year")}>
        {cells.map((d, i) =>
          d ? (
            <span
              key={d.day}
              className={`heatmap__cell heatmap__cell--${level(d)}`}
              title={`${date.format(new Date(`${d.day}T12:00:00`))}: ${d.done}`}
            />
          ) : (
            <span key={`pad-${i}`} className="heatmap__cell heatmap__cell--pad" />
          ),
        )}
      </div>
      <div className="legend">
        <span className="muted">{t("stats.less")}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heatmap__cell heatmap__cell--${l}`} />
        ))}
        <span className="muted">{t("stats.more")}</span>
      </div>
    </>
  );
}

const RESULT_PERIODS = [7, 30, 90] as const;
/** A difference in average answers this big is worth a word; smaller is noise on a 0..3 scale. */
const NOTABLE_DIFF = 0.5;

function kindEnabled(kind: BreakKind, s: AppInfo["settings"]): boolean {
  switch (kind) {
    case "micro":
      return s.microEnabled;
    case "movement":
      return s.movementEnabled;
    case "long":
      return s.longEnabled;
    case "neck":
      return s.neckDaily && s.sections.neck;
    case "breathing":
      return s.breathingDaily;
  }
}

/** "Result": what the user did, and how they felt in weeks with more and fewer breaks. Starts with the actions,
 * not with a percentage: a bad week still shows what was done. */
function ResultPage({ info }: { info: AppInfo }) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<number>(30);
  const [r, setR] = useState<ResultView | null>(null);
  useEffect(() => {
    getResult(period).then(setR, () => setR(null));
  }, [period]);
  if (!r) return null;
  const s = info.settings;
  const num = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });
  const w = r.thisWeek;
  const last = r.lastWeek;
  const kinds = BREAK_KINDS.filter((k) => kindEnabled(k, s) || r.kinds[k].done + r.kinds[k].skipped + r.kinds[k].away > 0);
  const startable = (k: BreakKind) => k !== "long";

  return (
    <>
      <Section title={t("result.thisWeek")}>
        <div className="stat-tiles">
          <Tile label={t("result.done")} value={String(w.done)} />
          {s.movementEnabled && <Tile label={t("result.stoodUp")} value={String(w.stoodUp)} />}
          {/* A zero tile reads as a failure; "not tried yet" below says it kindly. */}
          {s.neckDaily && w.neckDays > 0 && <Tile label={t("result.neckDays")} value={String(w.neckDays)} />}
          {s.breathingDaily && w.breathingDone > 0 && <Tile label={t("result.breathing")} value={String(w.breathingDone)} />}
          <Tile label={t("result.timeForYou")} value={formatDuration(w.breakSec, true)} />
        </div>
        {last.done + last.away > 0 && (
          <p className="muted">
            {t("result.lastWeek", { done: last.done, stood: last.stoodUp, time: formatDuration(last.breakSec, true) })}
          </p>
        )}
        {w.away > 0 && <p className="muted">{t("result.awayNote", { n: w.away })}</p>}
      </Section>

      <Section
        title={t("result.byKind")}
        aside={
          <div className="segmented segmented--small" role="tablist" aria-label={t("stats.period")}>
            {RESULT_PERIODS.map((p) => (
              <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}>
                {t(`stats.periods.${p}`)}
              </button>
            ))}
          </div>
        }
      >
        <div className="table-scroll" role="region" tabIndex={0} aria-label={t("result.byKind")}>
          <table className="result-table">
            <caption className="sr-only">{t("result.byKind")}</caption>
            <thead>
              <tr>
                <td />
                <th scope="col">{t("stats.done")}</th>
                <th scope="col">{t("stats.skipped")}</th>
                <th scope="col">{t("stats.away")}</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => {
                const c = r.kinds[k];
                return (
                  <tr key={k}>
                    <th scope="row">{t(`result.kinds.${k}`)}</th>
                    <td>{c.done}</td>
                    <td>{c.skipped}</td>
                    <td>{c.away}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {kinds
          .filter((k) => r.kinds[k].done === 0 && kindEnabled(k, s))
          .map((k) => (
            <p key={k} className="result-try">
              <span>{t("result.notTried", { kind: t(`result.kinds.${k}`) })}</span>
              {startable(k) && (
                <button className="button" onClick={() => startBreak(k)}>
                  {t("result.tryNow")}
                </button>
              )}
            </p>
          ))}
        <p className="muted">{t("result.periodTime", { time: formatDuration(r.breakSec, true) })}</p>
        <p className="muted">{t("stats.awayHint")}</p>
        {r.oldDays > 0 && <p className="muted">{t("result.oldDays")}</p>}
      </Section>

      <Section title={t("result.sitting")}>
        <div className="stat-tiles">
          <Tile label={t("result.avgLongest")} value={r.daysWorked ? formatDuration(r.avgLongestSittingSec, true) : "–"} />
          <Tile label={t("stats.longDays")} value={String(r.daysOver2h)} warn={r.daysOver2h > 0} />
        </div>
      </Section>

      <Section title={t("result.byWeek")}>
        <p className="muted section__lead">{t("result.byWeekHint")}</p>
        <div className="table-scroll" role="region" tabIndex={0} aria-label={t("result.byWeek")}>
          <table className="result-table">
            <caption className="sr-only">{t("result.byWeek")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("result.week")}</th>
                <th scope="col">{t("result.share")}</th>
                <th scope="col">{t("result.minutes")}</th>
                {WB_AREAS.map((a) => (
                  <th key={a} scope="col">
                    {t(`wellbeing.${a}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((wk) => (
                <tr key={wk.start}>
                  <th scope="row">{date.format(new Date(`${wk.start}T12:00:00`))}</th>
                  <td>{wk.share == null ? "–" : pct.format(wk.share)}</td>
                  <td>{formatDuration(wk.breakSec, true)}</td>
                  {WB_AREAS.map((a) => (
                    <td key={a}>
                      {wk.feel ? (
                        <span className="result-feel">
                          <span className={`wb-dot wb-dot--${Math.round(wk.feel[a])}`} aria-hidden="true" />
                          {num.format(wk.feel[a])}
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("result.compareTitle")}>
        {r.compare ? (
          <Comparison c={r.compare} num={num} />
        ) : (
          <p className="muted">{r.compareNeeds > 0 ? t("result.compareEmpty", { n: r.compareNeeds }) : t("result.compareFlat")}</p>
        )}
      </Section>
    </>
  );
}

function Comparison({ c, num }: { c: NonNullable<ResultView["compare"]>; num: Intl.NumberFormat }) {
  const { t, i18n } = useTranslation();
  const notable = WB_AREAS.filter((a) => Math.abs(c.fewer[a] - c.more[a]) >= NOTABLE_DIFF);
  // Area names as they read inside a sentence, joined the way the language joins a list.
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const names = (areas: readonly string[]) => list.format(areas.map((a) => t(`wellbeing.inline.${a}`)));
  const better = notable.filter((a) => c.more[a] < c.fewer[a]);
  const worse = notable.filter((a) => c.more[a] > c.fewer[a]);
  return (
    <>
      <div className="table-scroll" role="region" tabIndex={0} aria-label={t("result.compareTitle")}>
        <table className="result-table">
          <caption className="sr-only">{t("result.compareTitle")}</caption>
          <thead>
            <tr>
              <td />
              <th scope="col">{t("result.moreBreaks", { n: c.moreWeeks })}</th>
              <th scope="col">{t("result.fewerBreaks", { n: c.fewerWeeks })}</th>
            </tr>
          </thead>
          <tbody>
            {WB_AREAS.map((a) => (
              <tr key={a} className={notable.includes(a) ? "result-table__notable" : ""}>
                <th scope="row">{t(`wellbeing.${a}`)}</th>
                <td>{num.format(c.more[a])}</td>
                <td>{num.format(c.fewer[a])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {better.length > 0 && t("result.compareBetter", { areas: names(better) })}{" "}
        {worse.length > 0 && t("result.compareWorse", { areas: names(worse) })}
        {notable.length === 0 && t("result.compareSame")}{" "}
        {t("result.compareNote")}
      </p>
    </>
  );
}

const CATEGORIES: Category[] = ["work", "communication", "entertainment", "other"];
const APP_PERIODS = [1, 7, 30, 90] as const;

function Apps({ info, update, days }: { info: AppInfo; update: (p: SettingsPatch) => void; days: DayStats[] }) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<number>(7);
  const [usage, setUsage] = useState<DayUsage[]>([]);
  useEffect(() => {
    getUsage(range).then(setUsage);
  }, [range]);

  if (!info.usageSupported) return <p className="muted">{t("settings.usageUnsupported")}</p>;
  if (!info.settings.usageEnabled) return <p className="muted">{t("stats.appsOff")}</p>;

  const totals = new Map<string, number>();
  const hours = Array(24).fill(0) as number[];
  let longest: DayUsage["longest"] = null;
  for (const d of usage) {
    for (const [app, sec] of Object.entries(d.apps)) totals.set(app, (totals.get(app) ?? 0) + sec);
    d.hours.forEach((v, h) => (hours[h] += v));
    if (d.longest && (!longest || d.longest.sec > longest.sec)) longest = d.longest;
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const sum = sorted.reduce((s, [, v]) => s + v, 0);
  const top = sorted.slice(0, 10);
  const rest = sorted.slice(10).reduce((s, [, v]) => s + v, 0);
  const byCategory = new Map<Category, number>();
  for (const [app, sec] of sorted) {
    const c = appCategory(app, info.settings.usageCategories);
    byCategory.set(c, (byCategory.get(c) ?? 0) + sec);
  }
  const maxHour = Math.max(1, ...hours);
  const atComputer = days.slice(-range).reduce((s, d) => s + d.activeSec, 0);
  const workedDays = days.slice(-range).filter((d) => d.activeSec > 0).length;

  return (
    <>
      <div className="segmented segmented--small" role="tablist" aria-label={t("stats.period")}>
        {APP_PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={range === p} onClick={() => setRange(p)}>
            {p === 1 ? t("stats.today") : t(`stats.periods.${p}`)}
          </button>
        ))}
      </div>
      <div className="stat-tiles">
        <Tile label={t("stats.atComputer")} value={bigDuration(atComputer, i18n.language)} />
        {range > 1 && <Tile label={t("stats.perDay")} value={workedDays ? formatDuration(Math.round(atComputer / workedDays), true) : "–"} />}
        <Tile label={t("stats.inPrograms")} value={bigDuration(sum, i18n.language)} />
      </div>
      {sum === 0 ? (
        <p className="muted">{t("stats.appsEmpty")}</p>
      ) : (
        <>
          {longest && (
            <p className={longest.sec >= SITTING_RISK_SEC ? "notice" : "muted"}>
              {t("stats.longestIn", {
                app: appName(longest.app),
                time: formatDuration(longest.sec, true),
              })}
            </p>
          )}
          <Section title={t("stats.programs")}>
            <ul className="apps">
              {top.map(([app, sec]) => (
                <li key={app} className="apps__row">
                  <span className="apps__name">{appName(app)}</span>
                  <select
                    className="apps__category"
                    value={appCategory(app, info.settings.usageCategories)}
                    aria-label={t("stats.category")}
                    onChange={(e) => {
                      const category = e.target.value;
                      update((cur) => ({
                        usageCategories: {
                          ...cur.usageCategories,
                          [app]: category,
                        },
                      }));
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`stats.categories.${c}`)}
                      </option>
                    ))}
                  </select>
                  <span className="apps__bar">
                    <span style={{ width: `${(sec / sorted[0][1]) * 100}%` }} />
                  </span>
                  <span className="apps__time">
                    {formatDuration(sec, true)}
                    <small className="apps__share"> · {Math.round((sec / sum) * 100)}%</small>
                  </span>
                  <button
                    className="apps__exclude"
                    title={t("stats.exclude")}
                    aria-label={`${t("stats.exclude")}: ${appName(app)}`}
                    onClick={() =>
                      update((cur) => ({
                        usageExcluded: [...new Set([...cur.usageExcluded, app])],
                      }))
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
              {rest > 0 && (
                <li className="apps__row apps__row--rest">
                  <span className="apps__name">{t("stats.otherApps")}</span>
                  <span />
                  <span className="apps__bar">
                    <span style={{ width: `${(rest / sorted[0][1]) * 100}%` }} />
                  </span>
                  <span className="apps__time">{formatDuration(rest, true)}</span>
                  <span />
                </li>
              )}
            </ul>
          </Section>
          <Section title={t("stats.byCategory")}>
            <div className="stacked" role="img" aria-label={t("stats.byCategory")}>
              {CATEGORIES.filter((c) => byCategory.get(c)).map((c) => (
                <span
                  key={c}
                  className={`stacked__part stacked__part--${c}`}
                  style={{ flex: byCategory.get(c) }}
                  title={t(`stats.categories.${c}`)}
                />
              ))}
            </div>
            <div className="legend">
              {CATEGORIES.filter((c) => byCategory.get(c)).map((c) => (
                <span key={c} className={`legend__item legend__item--${c}`}>
                  {t(`stats.categories.${c}`)} · {formatDuration(byCategory.get(c) ?? 0, true)} · {Math.round(((byCategory.get(c) ?? 0) / sum) * 100)}
                  %
                </span>
              ))}
            </div>
          </Section>
          <Section title={t("stats.byHour")}>
            <div className="hours" role="img" aria-label={t("stats.byHour")}>
              {hours.map((v, h) => (
                <div key={h} className="hours__col" title={`${h}:00 · ${formatDuration(v, true)}`}>
                  <span style={{ height: `${(v / maxHour) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="hours__axis">
              <span>0</span>
              <span>6</span>
              <span>12</span>
              <span>18</span>
              <span>24</span>
            </div>
          </Section>
        </>
      )}
    </>
  );
}

const WB_KEYS = ["eyes", "neck", "back", "hands"] as const;

type Log = Record<string, Wellbeing>;

/** Wellbeing: the chart of recent entries and, under it, the journal to add, fix or delete them. One log for both,
 * so an edit shows in the chart at once. */
function WellbeingPage() {
  const [log, setLog] = useState<Log>({});
  useEffect(() => {
    getWellbeing().then(setLog);
  }, []);
  return (
    <>
      <WellbeingChart log={log} />
      <Journal log={log} setLog={setLog} />
    </>
  );
}

function WellbeingChart({ log }: { log: Log }) {
  const { t, i18n } = useTranslation();
  const entries = Object.entries(log)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
  });
  return (
    <Section title={t("wellbeing.chartTitle")}>
      <p className="muted section__lead">{t("wellbeing.chartHint")}</p>
      {entries.length === 0 ? (
        <p className="muted">{t("wellbeing.empty")}</p>
      ) : (
        <div className="table-scroll" role="region" tabIndex={0} aria-label={t("wellbeing.chartTitle")}>
        <table className="wb-table">
          <caption className="sr-only">{t("wellbeing.chartTitle")}</caption>
          <thead>
            <tr>
              <td />
              {entries.map(([d]) => (
                <th key={d} scope="col">{date.format(new Date(`${d}T12:00:00`))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WB_KEYS.map((k) => (
              <tr key={k}>
                <th scope="row">{t(`wellbeing.${k}`)}</th>
                {entries.map(([d, v]) => (
                  <td key={d}>
                    <span className={`wb-dot wb-dot--${v[k]}`} title={t(`wellbeing.level${v[k]}`)}>
                      <span aria-hidden="true">{v[k]}</span>
                      <span className="sr-only">{t(`wellbeing.level${v[k]}`)}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Section>
  );
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const EMPTY: Wellbeing = { eyes: 0, neck: 0, back: 0, hands: 0, note: "" };

/** Wellbeing by day: add an entry for any past day, fix or delete one. */
function Journal({ log, setLog }: { log: Log; setLog: (l: Log) => void }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftDay, setDraftDay] = useState(todayKey());
  const [draft, setDraft] = useState<Wellbeing>(EMPTY);
  const [error, setError] = useState("");
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const entries = Object.entries(log).sort(([a], [b]) => b.localeCompare(a));

  const startNew = () => {
    const day = todayKey();
    setDraftDay(day);
    setDraft(log[day] ?? EMPTY);
    setEditing("new");
  };
  const startEdit = (day: string) => {
    setDraftDay(day);
    setDraft({ ...EMPTY, ...log[day] });
    setEditing(day);
  };
  const save = async () => {
    try {
      const next = await setWellbeing(draftDay, draft);
      // Moving an entry to another day: the old one goes.
      if (editing && editing !== "new" && editing !== draftDay) setLog(await deleteWellbeing(editing));
      else setLog(next);
      setEditing(null);
      setError("");
    } catch (e) {
      setError(`${t("journal.saveFailed")}: ${String(e)}`);
    }
  };
  const remove = async (day: string) => {
    if (window.confirm(t("journal.deleteConfirm"))) setLog(await deleteWellbeing(day));
  };

  const form = (
    <div className="journal-form">
      <div className="row">
        <span className="row__label">{t("journal.day")}</span>
        <input
          type="date"
          value={draftDay}
          max={todayKey()}
          onChange={(e) => {
            if (!e.target.value) return;
            setDraftDay(e.target.value);
            if (editing === "new") setDraft(log[e.target.value] ?? EMPTY);
          }}
        />
      </div>
      {log[draftDay] && draftDay !== editing && <p className="muted">{t("journal.replaces")}</p>}
      {error && <p className="notice">{error}</p>}
      {WB_KEYS.map((k) => (
        <div key={k} className="row">
          <span className="row__label">{t(`wellbeing.${k}`)}</span>
          <div className="chips" role="radiogroup" aria-label={t(`wellbeing.${k}`)}>
            {[0, 1, 2, 3].map((v) => (
              <button
                key={v}
                className={`chip wb-chip wb-chip--${v}`}
                role="radio"
                aria-checked={draft[k] === v}
                aria-pressed={draft[k] === v}
                onClick={() => setDraft({ ...draft, [k]: v })}
              >
                {t(`wellbeing.level${v}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="row row--column">
        <span className="row__label">{t("journal.note")}</span>
        <textarea
          rows={2}
          maxLength={500}
          value={draft.note}
          placeholder={t("journal.notePlaceholder")}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </div>
      <div className="button-row">
        <button className="button button--primary" onClick={save}>
          {t("wellbeing.save")}
        </button>
        <button className="button" onClick={() => setEditing(null)}>
          {t("journal.cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <Section
      title={t("journal.title")}
      aside={
        editing === null ? (
          <button className="button" onClick={startNew}>
            {t("wellbeing.add")}
          </button>
        ) : undefined
      }
    >
      <p className="muted section__lead">{t("journal.hint")}</p>
      {editing === "new" && form}
      {entries.length === 0 && editing === null && <p className="muted">{t("wellbeing.empty")}</p>}
      <ul className="journal">
        {entries.map(([day, v]) =>
          editing === day ? (
            <li key={day} className="journal__item">
              {form}
            </li>
          ) : (
            <li key={day} className="journal__item">
              <div className="journal__head">
                <b>{date.format(new Date(`${day}T12:00:00`))}</b>
                <span className="journal__actions">
                  <button className="chip" onClick={() => startEdit(day)}>
                    {t("journal.edit")}
                  </button>
                  <button className="chip" onClick={() => remove(day)}>
                    {t("journal.delete")}
                  </button>
                </span>
              </div>
              <div className="journal__values">
                {WB_KEYS.map((k) => (
                  <span key={k} className="journal__value">
                    <span className={`wb-dot wb-dot--${v[k]}`} /> {t(`wellbeing.${k}`)}: {t(`wellbeing.level${v[k]}`).toLowerCase()}
                  </span>
                ))}
              </div>
              {v.note && <p className="journal__note">{v.note}</p>}
            </li>
          ),
        )}
      </ul>
    </Section>
  );
}

function Achievements({ days }: { days: DayStats[] }) {
  const { t } = useTranslation();
  const list = achievements(days);
  const [message, setMessage] = useState("");

  const share = async () => {
    const path = await saveDialog({
      defaultPath: "unslouch.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!path) return;
    const total = days.reduce((s, d) => s + d.done, 0);
    const png = await shareCard({
      title: t("app.name"),
      streak: t("share.streak", { count: streak(days) }),
      total: t("share.total", { count: total }),
      footer: t("share.footer"),
    });
    await savePng(path, Array.from(png)).then(
      () => setMessage(t("share.saved")),
      (e) => setMessage(String(e)),
    );
  };

  return (
    <Section
      title={t("achievements.title")}
      aside={
        <button className="button" onClick={share}>
          {t("share.button")}
        </button>
      }
    >
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      <ul className="badges">
        {list.map((a) => (
          <li key={a.id} className={`badge ${a.earned ? "badge--earned" : ""}`}>
            <span className="badge__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                {a.earned && <path d="M7 12.5 l3.2 3 L17 9" />}
              </svg>
            </span>
            <span className="badge__text">
              <b>{t(`achievements.${a.id}.title`)}</b>
              <small>{t(`achievements.${a.id}.hint`)}</small>
              {!a.earned && (
                <span className="badge__progress">
                  <span style={{ width: `${a.progress * 100}%` }} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** A 1200×630 picture for social networks: streak, breaks, link. Drawn on a canvas, no network. */
async function shareCard(text: { title: string; streak: string; total: string; footer: string }): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const c = canvas.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 0, 630);
  g.addColorStop(0, "#0f1d24");
  g.addColorStop(1, "#2a4c52");
  c.fillStyle = g;
  c.fillRect(0, 0, 1200, 630);
  c.fillStyle = "#2f5559";
  c.beginPath();
  c.moveTo(0, 470);
  c.quadraticCurveTo(300, 400, 600, 450);
  c.quadraticCurveTo(900, 500, 1200, 440);
  c.lineTo(1200, 630);
  c.lineTo(0, 630);
  c.fill();
  const font = "-apple-system, 'Segoe UI', system-ui, sans-serif";
  c.fillStyle = "#7fd3a0";
  c.font = `600 40px ${font}`;
  c.fillText(text.title, 80, 120);
  c.fillStyle = "#e9f1ee";
  c.font = `700 96px ${font}`;
  c.fillText(text.streak, 80, 260);
  c.font = `400 44px ${font}`;
  c.fillStyle = "#b7cbc6";
  c.fillText(text.total, 80, 340);
  c.font = `400 32px ${font}`;
  c.fillStyle = "#e9f1ee";
  c.fillText(text.footer, 80, 570);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** `range`: a value like "9:30–18:40" that may wrap after the dash instead of spilling out of the tile. */
function Tile({ label, value, warn, range }: { label: string; value: string; warn?: boolean; range?: boolean }) {
  return (
    <div className={`tile ${warn ? "tile--warn" : ""} ${range ? "tile--range" : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
