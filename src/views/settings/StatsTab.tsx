import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { AppInfo, DayStats, DayUsage, SettingsPatch, Wellbeing, getStats, getUsage, getWellbeing, savePng } from "../../api";
import { achievements, streak } from "../../lib/achievements";
import { Category, appCategory, appName } from "../../lib/apps";
import { formatDuration } from "../../format";
import { Section } from "./ui";

type Sub = "overview" | "apps" | "wellbeing" | "achievements";
const SITTING_RISK_SEC = 2 * 3600;

export function StatsTab({ info, update }: { info: AppInfo; update: (p: SettingsPatch) => void }) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<Sub>("overview");
  const [days, setDays] = useState<DayStats[]>([]);
  useEffect(() => {
    // All kept history (400 days): achievements are counted over it, the heatmap shows the last year.
    getStats(400).then(setDays);
  }, []);

  return (
    <>
      <div className="segmented" role="tablist">
        {(["overview", "apps", "wellbeing", "achievements"] as Sub[]).map((id) => (
          <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)}>
            {t(`stats.tabs.${id}`)}
          </button>
        ))}
      </div>
      {sub === "overview" && <Overview days={days.slice(-371)} />}
      {sub === "apps" && <Apps info={info} update={update} />}
      {sub === "wellbeing" && <WellbeingChart />}
      {sub === "achievements" && <Achievements days={days} />}
    </>
  );
}

function Overview({ days }: { days: DayStats[] }) {
  const { t, i18n } = useTranslation();
  if (!days.length) return null;
  const today = days[days.length - 1];
  const week = days.slice(-7);
  const max = Math.max(1, ...week.map((d) => d.done + d.skipped));
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
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
        {today.longestSittingSec >= SITTING_RISK_SEC && <p className="notice">{t("stats.sittingWarning")}</p>}
      </Section>

      <Section title={t("stats.week")}>
        {empty ? (
          <p className="muted">{t("stats.empty")}</p>
        ) : (
          <>
            <div className="week" role="img" aria-label={t("stats.week")}>
              {week.map((d) => (
                <div className="week__day" key={d.day} title={`${t("stats.done")}: ${d.done}, ${t("stats.skipped")}: ${d.skipped}`}>
                  <div className="week__bar">
                    <div className="week__skipped" style={{ height: `${(d.skipped / max) * 100}%` }} />
                    <div className="week__done" style={{ height: `${(d.done / max) * 100}%` }} />
                  </div>
                  <span className="week__label">{weekday.format(new Date(`${d.day}T12:00:00`))}</span>
                </div>
              ))}
            </div>
            <div className="legend">
              <span className="legend__item legend__item--done">{t("stats.done")}</span>
              <span className="legend__item legend__item--skipped">{t("stats.skipped")}</span>
            </div>
          </>
        )}
      </Section>

      <Section title={t("stats.year")}>
        <Heatmap days={days} />
      </Section>
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
  const date = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });
  return (
    <>
      <div className="heatmap" role="img" aria-label={t("stats.year")}>
        {cells.map((d, i) =>
          d ? (
            <span key={d.day} className={`heatmap__cell heatmap__cell--${level(d)}`} title={`${date.format(new Date(`${d.day}T12:00:00`))}: ${d.done}`} />
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

const CATEGORIES: Category[] = ["work", "communication", "entertainment", "other"];

function Apps({ info, update }: { info: AppInfo; update: (p: SettingsPatch) => void }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<1 | 7>(1);
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
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
  const byCategory = new Map<Category, number>();
  for (const [app, sec] of sorted) {
    const c = appCategory(app, info.settings.usageCategories);
    byCategory.set(c, (byCategory.get(c) ?? 0) + sec);
  }
  const maxHour = Math.max(1, ...hours);

  return (
    <>
      <div className="segmented segmented--small" role="tablist">
        <button role="tab" aria-selected={range === 1} onClick={() => setRange(1)}>
          {t("stats.today")}
        </button>
        <button role="tab" aria-selected={range === 7} onClick={() => setRange(7)}>
          {t("stats.week")}
        </button>
      </div>
      {sum === 0 ? (
        <p className="muted">{t("stats.appsEmpty")}</p>
      ) : (
        <>
          {longest && (
            <p className={longest.sec >= SITTING_RISK_SEC ? "notice" : "muted"}>
              {t("stats.longestIn", { app: appName(longest.app), time: formatDuration(longest.sec, true) })}
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
                      update((cur) => ({ usageCategories: { ...cur.usageCategories, [app]: category } }));
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
                  <span className="apps__time">{formatDuration(sec, true)}</span>
                  <button
                    className="apps__exclude"
                    title={t("stats.exclude")}
                    aria-label={`${t("stats.exclude")}: ${appName(app)}`}
                    onClick={() => update((cur) => ({ usageExcluded: [...new Set([...cur.usageExcluded, app])] }))}
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
                <span key={c} className={`stacked__part stacked__part--${c}`} style={{ flex: byCategory.get(c) }} title={t(`stats.categories.${c}`)} />
              ))}
            </div>
            <div className="legend">
              {CATEGORIES.filter((c) => byCategory.get(c)).map((c) => (
                <span key={c} className={`legend__item legend__item--${c}`}>
                  {t(`stats.categories.${c}`)} · {Math.round(((byCategory.get(c) ?? 0) / sum) * 100)}%
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

function WellbeingChart() {
  const { t, i18n } = useTranslation();
  const [log, setLog] = useState<Record<string, Wellbeing>>({});
  useEffect(() => {
    getWellbeing().then(setLog);
  }, []);
  const weeks = Object.entries(log).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const date = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });
  const keys = ["eyes", "neck", "back", "hands"] as const;
  return (
    <Section title={t("wellbeing.chartTitle")}>
      <p className="muted section__lead">{t("wellbeing.chartHint")}</p>
      {weeks.length === 0 ? (
        <p className="muted">{t("wellbeing.empty")}</p>
      ) : (
        <table className="wb-table">
          <thead>
            <tr>
              <th />
              {weeks.map(([w]) => (
                <th key={w}>{date.format(new Date(`${w}T12:00:00`))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th>{t(`wellbeing.${k}`)}</th>
                {weeks.map(([w, v]) => (
                  <td key={w}>
                    <span className={`wb-dot wb-dot--${v[k]}`} title={t(`wellbeing.level${v[k]}`)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function Achievements({ days }: { days: DayStats[] }) {
  const { t } = useTranslation();
  const list = achievements(days);
  const [message, setMessage] = useState("");

  const share = async () => {
    const path = await saveDialog({ defaultPath: "unslouch.png", filters: [{ name: "PNG", extensions: ["png"] }] });
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
    <Section title={t("achievements.title")} aside={<button className="button" onClick={share}>{t("share.button")}</button>}>
      {message && <p className="muted" role="status">{message}</p>}
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

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`tile ${warn ? "tile--warn" : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
