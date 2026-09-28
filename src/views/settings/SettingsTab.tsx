import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { AppInfo, PRESETS, Preset, Settings, SettingsPatch, clearUsage, exportData, importData, previewCue } from "../../api";
import type { Section as BodySection } from "../../exercises/catalog";
import { LANGUAGE_NAMES } from "../../i18n";
import { SOURCES } from "../../lib/sources";
import { NumberSelect, Row, Section, TimeInput, Toggle, Why } from "./ui";
import { Checklist } from "./Checklist";

const BODY: BodySection[] = ["eyes", "neck", "back", "hands", "legs", "breath"];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Fields that belong to a preset: touching them switches the preset to "custom". */
const PRESET_FIELDS = new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p)));

export function SettingsTab({ info, update, onImported }: {
  info: AppInfo;
  update: (patch: SettingsPatch) => void;
  onImported: (info: AppInfo) => void;
}) {
  const { t, i18n } = useTranslation();
  const s = info.settings;
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [newExcluded, setNewExcluded] = useState("");
  const min = t("settings.min");
  const sec = t("settings.sec");

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);

  /** Any change to a preset number means the user made their own rhythm. */
  const set = (patch: Partial<Settings>) => {
    const custom = Object.keys(patch).some((k) => PRESET_FIELDS.has(k));
    update(custom ? { ...patch, preset: "custom" } : patch);
  };

  const choosePreset = (preset: Preset) => {
    update(preset === "custom" ? { preset } : { ...PRESETS[preset], preset });
  };

  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
  // 2024-01-01 is a Monday.
  const dayName = (d: number) => weekday.format(new Date(2024, 0, d));

  const doExport = async () => {
    const path = await saveDialog({ defaultPath: "unslouch-backup.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    await exportData(path).then(
      () => setMessage(t("data.exported")),
      (e) => setMessage(String(e)),
    );
  };

  const doImport = async () => {
    const path = await openDialog({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return;
    await importData(path).then(
      (next) => {
        onImported(next);
        setMessage(t("data.imported"));
      },
      () => setMessage(t("data.importFailed")),
    );
  };

  return (
    <>
      <Section title={t("settings.rhythm")}>
        <Row label={t("settings.preset")} hint={t(`settings.presetHint.${s.preset}`)}>
          <select value={s.preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
            {(["recommended", "pomodoro", "hourly", "custom"] as Preset[]).map((p) => (
              <option key={p} value={p}>
                {t(`settings.presets.${p}`)}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title={t("settings.body")}>
        <p className="muted section__lead">{t("settings.bodyHint")}</p>
        {BODY.map((b) => (
          <div key={b} className="body-row">
            <Toggle
              label={t(`sections.${b}`)}
              hint={t(`sections.${b}Hint`)}
              checked={s.sections[b]}
              onChange={(v) => update((cur) => ({ sections: { ...cur.sections, [b]: v } }))}
            />
            <Why id={b} sources={SOURCES[b]} />
          </div>
        ))}
      </Section>

      <Section title={t("settings.microSection")}>
        <Toggle label={t("settings.microEnabled")} hint={t("settings.microHint")} checked={s.microEnabled} onChange={(v) => set({ microEnabled: v })} />
        <Row label={t("settings.every")} disabled={!s.microEnabled}>
          <NumberSelect value={s.microIntervalMin} options={[10, 15, 20, 25, 30, 40]} unit={min} onChange={(v) => set({ microIntervalMin: v })} />
        </Row>
        <Row label={t("settings.lookFarFor")} disabled={!s.microEnabled}>
          <NumberSelect value={s.microLookSec} options={[10, 20, 30, 45, 60]} unit={sec} onChange={(v) => set({ microLookSec: v })} />
        </Row>
      </Section>

      <Section title={t("settings.movementSection")}>
        <Toggle label={t("settings.movementEnabled")} hint={t("settings.movementHint")} checked={s.movementEnabled} onChange={(v) => set({ movementEnabled: v })} />
        <Row label={t("settings.every")} disabled={!s.movementEnabled}>
          <NumberSelect value={s.movementIntervalMin} options={[25, 30, 45, 60, 90]} unit={min} onChange={(v) => set({ movementIntervalMin: v })} />
        </Row>
        <Row label={t("settings.duration")} disabled={!s.movementEnabled}>
          <NumberSelect value={s.movementDurationMin} options={[2, 3, 5, 10]} unit={min} onChange={(v) => set({ movementDurationMin: v })} />
        </Row>
        <Toggle label={t("settings.longEnabled")} hint={t("settings.longHint")} checked={s.longEnabled} onChange={(v) => set({ longEnabled: v })} />
        {s.longEnabled && (
          <>
            <Row label={t("settings.every")}>
              <NumberSelect value={s.longIntervalMin} options={[90, 120, 150, 180, 240]} unit={min} onChange={(v) => set({ longIntervalMin: v })} />
            </Row>
            <Row label={t("settings.duration")}>
              <NumberSelect value={s.longDurationMin} options={[5, 10, 15, 20, 30]} unit={min} onChange={(v) => set({ longDurationMin: v })} />
            </Row>
          </>
        )}
      </Section>

      <Section title={t("settings.cuesSection")}>
        <p className="muted section__lead">{t("settings.cuesHint")}</p>
        <Toggle label={t("settings.blinkCue")} hint={t("settings.blinkCueHint")} checked={s.blinkCueEnabled} onChange={(v) => update({ blinkCueEnabled: v })} />
        {s.blinkCueEnabled && (
          <Row label={t("settings.every")}>
            <NumberSelect value={s.blinkIntervalMin} options={[2, 3, 5, 7, 10, 15]} unit={min} onChange={(v) => update({ blinkIntervalMin: v })} />
            <button className="chip chip--show" onClick={() => previewCue("blink")}>
              {t("settings.showCue")}
            </button>
          </Row>
        )}
        {s.blinkCueEnabled && (
          <Row label={t("settings.blinkCueFor")}>
            <NumberSelect value={s.blinkCueSec} options={[2, 3, 4, 5, 7, 10]} unit={sec} onChange={(v) => update({ blinkCueSec: v })} />
          </Row>
        )}
        <Toggle label={t("settings.postureCue")} hint={t("settings.postureCueHint")} checked={s.postureCueEnabled} onChange={(v) => update({ postureCueEnabled: v })} />
        {s.postureCueEnabled && (
          <Row label={t("settings.every")}>
            <NumberSelect value={s.postureIntervalMin} options={[15, 20, 30, 45, 60]} unit={min} onChange={(v) => update({ postureIntervalMin: v })} />
            <button className="chip chip--show" onClick={() => previewCue("posture")}>
              {t("settings.showCue")}
            </button>
          </Row>
        )}
        <Toggle label={t("settings.water")} hint={t("settings.waterHint")} checked={s.waterEnabled} onChange={(v) => update({ waterEnabled: v })} />
        {s.waterEnabled && (
          <Row label={t("settings.every")}>
            <NumberSelect value={s.waterIntervalMin} options={[45, 60, 90, 120, 180]} unit={min} onChange={(v) => update({ waterIntervalMin: v })} />
            <button className="chip chip--show" onClick={() => previewCue("water")}>
              {t("settings.showCue")}
            </button>
          </Row>
        )}
        <Toggle label={t("settings.cueSound")} hint={t("settings.cueSoundHint")} checked={s.cueSound} onChange={(v) => update({ cueSound: v })} />
        <Why id="water" sources={SOURCES.water} />
      </Section>

      <Section title={t("settings.dailySection")}>
        <Toggle label={t("settings.neckDaily")} hint={t("settings.neckDailyHint")} checked={s.neckDaily} disabled={!s.sections.neck} onChange={(v) => update({ neckDaily: v })} />
        <Toggle label={t("settings.breathingDaily")} hint={t("settings.breathingDailyHint")} checked={s.breathingDaily} onChange={(v) => update({ breathingDaily: v })} />
        <Toggle label={t("settings.endOfDay")} hint={t("settings.endOfDayHint")} checked={s.endOfDayEnabled} onChange={(v) => update({ endOfDayEnabled: v })} />
        {s.endOfDayEnabled && (
          <Row label={t("settings.at")}>
            <TimeInput value={s.endOfDayTime} onChange={(v) => update({ endOfDayTime: v })} />
          </Row>
        )}
      </Section>

      <Section title={t("settings.workSection")}>
        <Toggle label={t("settings.workHours")} hint={t("settings.workHoursHint")} checked={s.workHoursEnabled} onChange={(v) => update({ workHoursEnabled: v })} />
        {s.workHoursEnabled && (
          <>
            <div className="row">
              <span className="row__label">{t("settings.workDays")}</span>
              <div className="chips" role="group" aria-label={t("settings.workDays")}>
                {DAYS.map((d) => (
                  <button
                    key={d}
                    className="chip"
                    aria-pressed={s.workDays.includes(d)}
                    // The last day can't be turned off: no work days would silence the app.
                    disabled={s.workDays.length === 1 && s.workDays.includes(d)}
                    onClick={() =>
                      update((cur) => ({
                        workDays: cur.workDays.includes(d) ? cur.workDays.filter((x) => x !== d) : [...cur.workDays, d],
                      }))
                    }
                  >
                    {dayName(d)}
                  </button>
                ))}
              </div>
            </div>
            <Row label={t("settings.from")}>
              <TimeInput value={s.workStart} onChange={(v) => update({ workStart: v })} />
            </Row>
            <Row label={t("settings.to")}>
              <TimeInput value={s.workEnd} onChange={(v) => update({ workEnd: v })} />
            </Row>
          </>
        )}
      </Section>

      <Section title={t("settings.quietSection")}>
        <Toggle label={t("settings.pauseOnCalls")} hint={t("settings.pauseOnCallsHint")} checked={s.pauseOnCalls} onChange={(v) => update({ pauseOnCalls: v })} />
        <Toggle label={t("settings.pauseInFullscreen")} hint={info.wayland ? t("settings.waylandNoFullscreen") : undefined} checked={s.pauseInFullscreen} onChange={(v) => update({ pauseInFullscreen: v })} />
        <Toggle
          label={t("settings.respectDnd")}
          hint={info.platform === "macos" ? t("settings.respectDndMac") : undefined}
          checked={s.respectDnd}
          onChange={(v) => update({ respectDnd: v })}
        />
        <Row label={t("settings.snooze")}>
          <NumberSelect value={s.snoozeMin} options={[5, 10, 15]} unit={min} onChange={(v) => update({ snoozeMin: v })} />
        </Row>
        <Row label={t("settings.idleReset")} hint={t("settings.idleResetHint")}>
          <NumberSelect value={s.idleResetMin} options={[2, 3, 5, 10, 15]} unit={min} onChange={(v) => update({ idleResetMin: v })} />
        </Row>
      </Section>

      <Section title={t("settings.usageSection")}>
        <Toggle
          label={t("settings.usageEnabled")}
          hint={info.usageSupported ? t("settings.usagePrivacy") : t("settings.usageUnsupported")}
          checked={s.usageEnabled}
          disabled={!info.usageSupported}
          onChange={(v) => update({ usageEnabled: v })}
        />
        <div className="row row--column">
          <span className="row__label">
            {t("settings.usageExcluded")}
            <small className="row__hint">{t("settings.usageExcludedHint")}</small>
          </span>
          <div className="chips">
            {s.usageExcluded.map((app) => (
              <button key={app} className="chip" aria-pressed onClick={() => update((cur) => ({ usageExcluded: cur.usageExcluded.filter((a) => a !== app) }))}>
                {app} ✕
              </button>
            ))}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = newExcluded.trim();
                if (v) update((cur) => ({ usageExcluded: cur.usageExcluded.includes(v) ? cur.usageExcluded : [...cur.usageExcluded, v] }));
                setNewExcluded("");
              }}
            >
              <input value={newExcluded} placeholder={t("settings.usageAddPlaceholder")} onChange={(e) => setNewExcluded(e.target.value)} />
            </form>
          </div>
        </div>
        <button
          className="button button--danger"
          onClick={() => {
            if (window.confirm(t("settings.usageClearConfirm"))) clearUsage().then(() => setMessage(t("settings.usageCleared")));
          }}
        >
          {t("settings.usageClear")}
        </button>
      </Section>

      <Section title={t("settings.workplaceSection")}>
        <Checklist />
        <Why id="workplace" sources={SOURCES.workplace} />
      </Section>

      <Section title={t("settings.generalSection")}>
        <Row label={t("settings.theme")}>
          <select value={s.theme} onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}>
            <option value="system">{t("settings.themeSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </Row>
        <Row label={t("settings.language")}>
          <select value={s.language ?? ""} onChange={(e) => update({ language: e.target.value || null })}>
            <option value="">{t("settings.systemLanguage")}</option>
            {info.languages.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code] ?? code}
              </option>
            ))}
          </select>
        </Row>
        <Toggle label={t("settings.sound")} hint={t("settings.soundHint")} checked={s.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
        {autostart !== null && (
          <Toggle
            label={t("settings.autostart")}
            checked={autostart}
            onChange={async (on) => {
              await (on ? enable() : disable());
              setAutostart(await isEnabled());
            }}
          />
        )}
        <Toggle label={t("settings.checkUpdates")} hint={t("settings.checkUpdatesHint")} checked={s.checkUpdates} onChange={(v) => update({ checkUpdates: v })} />
        <div className="row">
          <span className="row__label">
            {t("data.title")}
            <small className="row__hint">{t("data.hint")}</small>
          </span>
          <div className="button-row">
            <button className="button" onClick={doExport}>
              {t("data.export")}
            </button>
            <button className="button" onClick={doImport}>
              {t("data.import")}
            </button>
          </div>
        </div>
        {message && <p className="muted" role="status">{message}</p>}
      </Section>

      <button className="button" onClick={() => choosePreset("recommended")}>
        {t("settings.defaults")}
      </button>
    </>
  );
}
