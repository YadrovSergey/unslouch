import { app, t, type Lang } from "../i18n";
import type { IslandText } from "../components/islands/common";

/** Texts every interactive island needs: exercise names and steps from the app, and the break player. */
export const islandText = (lang: Lang): IslandText => ({
  lang,
  ex: app(lang).ex as unknown as IslandText["ex"],
  player: t(lang).player,
});
