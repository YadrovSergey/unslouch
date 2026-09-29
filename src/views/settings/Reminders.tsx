import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Reminder, SettingsPatch, previewReminder } from "../../api";
import { formatDuration } from "../../format";
import { Row, Section, TimeInput, Toggle } from "./ui";

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS = [1, 2, 3, 4, 5];
const MAX = 20;

/** Ready-made starting points: the title is filled in the user's language and can be changed. */
const TEMPLATES: { key: string; make: () => Omit<Reminder, "id" | "title"> }[] = [
  {
    key: "pills",
    make: () => ({
      enabled: true,
      kind: "times",
      times: ["09:00", "21:00"],
      days: DAYS,
      intervalMin: 60,
    }),
  },
  {
    key: "lunch",
    make: () => ({
      enabled: true,
      kind: "times",
      times: ["13:00"],
      days: WEEKDAYS,
      intervalMin: 60,
    }),
  },
  {
    key: "own",
    make: () => ({
      enabled: true,
      kind: "times",
      times: ["12:00"],
      days: DAYS,
      intervalMin: 60,
    }),
  },
];

const newId = () => `r${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** The user's own reminders (pills, lunch…): a card in the corner at the chosen times, until answered. */
export function Reminders({ list, update }: { list: Reminder[]; update: (patch: SettingsPatch) => void }) {
  const { t, i18n } = useTranslation();
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
  // 2024-01-01 is a Monday.
  const dayName = (d: number) => weekday.format(new Date(2024, 0, d));

  const change = (id: string, patch: Partial<Reminder>) =>
    update((cur) => ({
      reminders: cur.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const remove = (id: string) => update((cur) => ({ reminders: cur.reminders.filter((r) => r.id !== id) }));
  const add = (key: string, make: () => Omit<Reminder, "id" | "title">) =>
    update((cur) => ({
      reminders: [
        ...cur.reminders,
        {
          ...make(),
          id: newId(),
          title: key === "own" ? "" : t(`reminders.templates.${key}`),
        },
      ],
    }));

  return (
    <Section title={t("reminders.title")}>
      <p className="muted section__lead">{t("reminders.hint")}</p>
      {list.map((r) => (
        <ReminderEditor key={r.id} r={r} dayName={dayName} change={(p) => change(r.id, p)} remove={() => remove(r.id)} />
      ))}
      {list.length < MAX && (
        <div className="button-row reminder-add">
          {TEMPLATES.map(({ key, make }) => (
            <button key={key} className="button" onClick={() => add(key, make)}>
              + {t(`reminders.templates.${key}`)}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function ReminderEditor({
  r,
  dayName,
  change,
  remove,
}: {
  r: Reminder;
  dayName: (d: number) => string;
  change: (patch: Partial<Reminder>) => void;
  remove: () => void;
}) {
  const { t } = useTranslation();
  const [newTime, setNewTime] = useState("18:00");
  return (
    <div className={`reminder-card ${r.enabled ? "" : "reminder-card--off"}`}>
      <div className="reminder-card__head">
        <input
          className="reminder-card__title"
          value={r.title}
          maxLength={80}
          placeholder={t("reminders.titlePlaceholder")}
          aria-label={t("reminders.titleLabel")}
          onChange={(e) => change({ title: e.target.value })}
        />
        <Toggle label="" checked={r.enabled} onChange={(v) => change({ enabled: v })} />
      </div>
      <Row label={t("reminders.when")}>
        <select value={r.kind} onChange={(e) => change({ kind: e.target.value as Reminder["kind"] })}>
          <option value="times">{t("reminders.kindTimes")}</option>
          <option value="interval">{t("reminders.kindInterval")}</option>
        </select>
      </Row>
      {r.kind === "times" ? (
        <>
          <div className="row">
            <span className="row__label">{t("reminders.times")}</span>
            <div className="chips">
              {r.times.map((time) => (
                <button
                  key={time}
                  className="chip"
                  aria-pressed
                  disabled={r.times.length === 1}
                  aria-label={`${t("reminders.removeTime")}: ${time}`}
                  onClick={() => change({ times: r.times.filter((x) => x !== time) })}
                >
                  {time} {r.times.length > 1 && "✕"}
                </button>
              ))}
              <TimeInput value={newTime} onChange={setNewTime} label={t("reminders.newTime")} />
              <button className="chip" onClick={() => !r.times.includes(newTime) && change({ times: [...r.times, newTime].sort() })}>
                + {t("reminders.addTime")}
              </button>
            </div>
          </div>
          <div className="row">
            <span className="row__label">{t("settings.workDays")}</span>
            <div className="chips" role="group" aria-label={t("settings.workDays")}>
              {DAYS.map((d) => (
                <button
                  key={d}
                  className="chip"
                  aria-pressed={r.days.includes(d)}
                  // At least one day: no days would silence the reminder without saying so.
                  disabled={r.days.length === 1 && r.days.includes(d)}
                  onClick={() =>
                    change({
                      days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort(),
                    })
                  }
                >
                  {dayName(d)}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <Row label={t("settings.every")} hint={t("reminders.intervalHint")}>
          <IntervalPicker value={r.intervalMin} onChange={(v) => change({ intervalMin: v })} />
        </Row>
      )}
      <div className="button-row reminder-card__actions">
        <button className="chip" onClick={() => previewReminder(r.id)}>
          {t("settings.showCue")}
        </button>
        <button className="chip" onClick={() => window.confirm(t("reminders.deleteConfirm")) && remove()}>
          {t("reminders.delete")}
        </button>
      </div>
    </div>
  );
}

const INTERVALS = [15, 30, 45, 60, 90, 120, 180, 240];

/** Ready intervals up to 4 hours, or the user's own number of minutes (5 to 480). */
function IntervalPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t, i18n } = useTranslation();
  const [own, setOwn] = useState(!INTERVALS.includes(value));
  const [text, setText] = useState(String(value));
  return (
    <span className="interval-picker">
      <select
        value={own ? "own" : value}
        aria-label={t("settings.every")}
        onChange={(e) => {
          if (e.target.value === "own") {
            setOwn(true);
            setText(String(value));
          } else {
            setOwn(false);
            onChange(Number(e.target.value));
          }
        }}
      >
        {INTERVALS.map((n) => (
          <option key={n} value={n}>
            {n % 60 === 0
              ? new Intl.NumberFormat(i18n.language, { style: "unit", unit: "hour", unitDisplay: "short" }).format(n / 60)
              : formatDuration(n * 60, true)}
          </option>
        ))}
        <option value="own">{t("reminders.ownInterval")}</option>
      </select>
      {own && (
        <label className="interval-picker__own">
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={text}
            aria-label={t("reminders.ownInterval")}
            onChange={(e) => {
              setText(e.target.value);
              const n = Math.round(Number(e.target.value));
              if (n >= 5 && n <= 480) onChange(n);
            }}
            // Out of range or empty: show and save the nearest allowed value, never a number that wasn't saved.
            onBlur={() => {
              const n = Math.min(480, Math.max(5, Math.round(Number(text)) || value));
              setText(String(n));
              onChange(n);
            }}
          />
          {t("settings.min")}
        </label>
      )}
    </span>
  );
}
