import React from "react";
import ReactDOM from "react-dom/client";
import { getAppInfo } from "./api";
import { initI18n } from "./i18n";
import { applyTheme } from "./theme";
import { BreakView } from "./views/BreakView";
import { CueView } from "./views/CueView";
import { SettingsView } from "./views/SettingsView";
import { GalleryView } from "./views/GalleryView";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view") ?? "settings";

async function start() {
  // Break and cue windows get the language in the URL: they must open instantly.
  const info = params.get("lang") ? null : await getAppInfo().catch(() => null);
  const language = params.get("lang") ?? info?.language ?? "en";
  await initI18n(language);
  const theme = (params.get("theme") ?? info?.settings.theme) as Parameters<typeof applyTheme>[0] | undefined;
  if (theme) applyTheme(theme);
  document.body.dataset.view = view;
  const content =
    view === "break" ? (
      <BreakView params={params} />
    ) : view === "cue" ? (
      <CueView params={params} />
    ) : view === "gallery" ? (
      <GalleryView only={params.get("only")?.split(",")} steps={params.has("steps")} />
    ) : (
      <SettingsView />
    );
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{content}</React.StrictMode>,
  );
}

start();
