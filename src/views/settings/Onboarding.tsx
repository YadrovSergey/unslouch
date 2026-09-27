import { useState } from "react";
import { disable, enable } from "@tauri-apps/plugin-autostart";
import { useTranslation } from "react-i18next";
import { AppInfo, Sections, SettingsPatch } from "../../api";
import type { Section as BodySection } from "../../exercises/catalog";
import { Checklist } from "./Checklist";

const CONCERNS: BodySection[] = ["eyes", "neck", "back", "hands", "legs", "breath"];

/** First run: where the icon lives, what bothers the user, time per program, workstation. */
export function Onboarding({ info, update, onDone }: {
  info: AppInfo;
  update: (p: SettingsPatch) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState<Sections>(info.settings.sections);
  const [usage, setUsage] = useState(info.settings.usageEnabled && info.usageSupported);
  const [workHours, setWorkHours] = useState(info.settings.workHoursEnabled);
  const [autostart, setAutostart] = useState(true);
  const where = info.platform === "macos" ? "whereMac" : info.platform === "windows" ? "whereWin" : "whereLinux";

  const finish = () => {
    // Asked here, never switched on silently.
    (autostart ? enable() : disable()).catch(() => {});
    update({
      sections,
      breathingDaily: sections.breath,
      usageEnabled: usage,
      workHoursEnabled: workHours,
      onboardingDone: true,
    });
    onDone();
  };

  return (
    <div className="onboarding">
      <div className="onboarding__dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i === step ? "active" : ""} />
        ))}
      </div>
      {step === 0 && (
        <section>
          <h1>{t("onboarding.title")}</h1>
          <p>{t(`onboarding.${where}`)}</p>
          <p>{t("onboarding.how")}</p>
          <p className="notice">{t("onboarding.disclaimer")}</p>
          <button className="button button--primary" onClick={() => setStep(1)}>
            {t("onboarding.next")}
          </button>
        </section>
      )}
      {step === 1 && (
        <section>
          <h1>{t("onboarding.concernsTitle")}</h1>
          <p className="muted">{t("onboarding.concernsHint")}</p>
          <div className="concerns">
            {CONCERNS.map((c) => (
              <label key={c} className={`concern ${sections[c] ? "concern--on" : ""}`}>
                <input type="checkbox" checked={sections[c]} onChange={(e) => setSections({ ...sections, [c]: e.target.checked })} />
                <b>{t(`sections.${c}`)}</b>
                <small>{t(`onboarding.concern.${c}`)}</small>
              </label>
            ))}
          </div>
          <label className="row toggle">
            <span className="row__label">
              {t("onboarding.workHours", { from: info.settings.workStart, to: info.settings.workEnd })}
              <small className="row__hint">{t("onboarding.workHoursHint")}</small>
            </span>
            <input type="checkbox" role="switch" checked={workHours} onChange={(e) => setWorkHours(e.target.checked)} />
          </label>
          <label className="row toggle">
            <span className="row__label">{t("settings.autostart")}</span>
            <input type="checkbox" role="switch" checked={autostart} onChange={(e) => setAutostart(e.target.checked)} />
          </label>
          {info.usageSupported && (
            <label className="row toggle">
              <span className="row__label">
                {t("settings.usageEnabled")}
                <small className="row__hint">{t("settings.usagePrivacy")}</small>
              </span>
              <input type="checkbox" role="switch" checked={usage} onChange={(e) => setUsage(e.target.checked)} />
            </label>
          )}
          <div className="button-row">
            <button className="button" onClick={() => setStep(0)}>
              {t("onboarding.back")}
            </button>
            <button className="button button--primary" onClick={() => setStep(2)}>
              {t("onboarding.next")}
            </button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section>
          <h1>{t("onboarding.workplaceTitle")}</h1>
          <p className="muted">{t("onboarding.workplaceHint")}</p>
          <Checklist />
          <div className="button-row">
            <button className="button" onClick={() => setStep(1)}>
              {t("onboarding.back")}
            </button>
            <button className="button button--primary" onClick={finish}>
              {t("onboarding.finish")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
