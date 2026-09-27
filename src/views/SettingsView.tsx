import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppInfo, SettingsPatch, getAppInfo, saveSettings } from "../api";
import { setLanguage } from "../i18n";
import { applyTheme } from "../theme";
import { AboutTab } from "./settings/AboutTab";
import { Onboarding } from "./settings/Onboarding";
import { SettingsTab } from "./settings/SettingsTab";
import { StatsTab } from "./settings/StatsTab";
import { GalleryView } from "./GalleryView";

type Tab = "settings" | "stats" | "exercises" | "about";
const TABS: Tab[] = ["settings", "stats", "exercises", "about"];

function readHash(): Tab | "onboarding" {
  const hash = window.location.hash.replace("#", "");
  if (hash === "onboarding") return "onboarding";
  return (TABS as string[]).includes(hash) ? (hash as Tab) : "settings";
}

export function SettingsView() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [tab, setTab] = useState<Tab | "onboarding">(readHash());
  // The latest settings, including changes still being saved: a second quick change builds on the first.
  const latest = useRef<AppInfo | null>(null);
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const apply = (next: AppInfo) => {
    latest.current = next;
    setInfo(next);
    setLanguage(next.language);
    applyTheme(next.settings.theme);
  };

  const openTab = (id: Tab | "onboarding") => {
    // Until the first-run screen is done, the tray items don't take the user away from it.
    if (latest.current && !latest.current.settings.onboardingDone) id = "onboarding";
    setTab(id);
  };

  useEffect(() => {
    getAppInfo().then((i) => {
      apply(i);
      if (!i.settings.onboardingDone) setTab("onboarding");
    });
    const onHash = () => openTab(readHash());
    window.addEventListener("hashchange", onHash);
    // Our own saves come back as this event too; while saves are queued, their answers are applied instead.
    const unlisten = listen<AppInfo>("app-info", (e) => {
      if (pending.current === 0) apply(e.payload);
    });
    return () => {
      window.removeEventListener("hashchange", onHash);
      unlisten.then((f) => f());
    };
  }, []);

  if (!info) return null;

  const update = (patch: SettingsPatch) => {
    const base = latest.current!;
    const settings = { ...base.settings, ...(typeof patch === "function" ? patch(base.settings) : patch) };
    apply({ ...base, settings });
    pending.current += 1;
    queue.current = queue.current
      .then(() => saveSettings(settings))
      .then((saved) => {
        pending.current -= 1;
        if (pending.current === 0) apply(saved);
      })
      .catch(() => {
        pending.current -= 1;
      });
  };

  if (tab === "onboarding") {
    return (
      <div className="app">
        <div className="app__body">
          <Onboarding info={info} update={update} onDone={() => setTab("settings")} />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className="tabs__tab"
            onClick={() => {
              // Keep the hash in step, so a tray item pointing to this tab still switches it later.
              window.location.hash = id;
              setTab(id);
            }}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </nav>
      <div className={`app__body ${tab === "exercises" ? "app__body--flush" : ""}`}>
        {tab === "settings" && <SettingsTab info={info} update={update} onImported={apply} />}
        {tab === "stats" && <StatsTab info={info} update={update} />}
        {tab === "exercises" && <GalleryView />}
        {tab === "about" && <AboutTab info={info} />}
        {info.isCis && (tab === "settings" || tab === "about") && <Promo url={info.mzrUrl} />}
      </div>
    </div>
  );
}

function Promo({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <aside className="promo">
      <div>
        <strong>{t("promo.title")}</strong>
        <p>{t("promo.text")}</p>
      </div>
      <button className="button button--primary" onClick={() => openUrl(url)}>
        {t("promo.button")}
      </button>
    </aside>
  );
}
