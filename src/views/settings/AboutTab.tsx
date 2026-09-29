import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppInfo, REPO_URL, SITE_URL, SUPPORT_EMAIL, donatePage } from "../../api";
import { ExternalLink, Section } from "./ui";
import authorPhoto from "../../assets/author.webp";
import { Changelog } from "./Changelog";

export function AboutTab({ info }: { info: AppInfo }) {
  const { t } = useTranslation();
  const legal = info.language === "ru" ? "ru" : "en";
  const [page, setPage] = useState<"app" | "changelog">("app");
  return (
    <>
      <div className="subtabs" role="tablist">
        {(["app", "changelog"] as const).map((id) => (
          <button key={id} role="tab" aria-selected={page === id} className="subtabs__tab" onClick={() => setPage(id)}>
            {t(`about.pages.${id}`)}
          </button>
        ))}
      </div>
      {page === "changelog" ? (
        <Changelog language={info.language} />
      ) : (
        <>
          <Story info={info} />
          <Section title={t("app.name")}>
            <p>{t("about.text")}</p>
            <p className="notice">{t("about.disclaimer")}</p>
            <p className="muted">{t("about.asIs")}</p>
            <ul className="links">
              <li>
                <ExternalLink href={SITE_URL}>{t("about.site")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={REPO_URL}>{t("about.openSource")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={`${REPO_URL}/blob/main/docs/science.${legal}.md`}>{t("about.science")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={`${REPO_URL}/blob/main/legal/privacy.${legal}.md`}>{t("about.privacy")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={`${REPO_URL}/blob/main/legal/terms.${legal}.md`}>{t("about.terms")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={`${REPO_URL}/blob/main/THIRD_PARTY_LICENSES.md`}>{t("about.licenses")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={`${REPO_URL}/issues/new?template=bug.yml`}>{t("about.bug")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={`mailto:${SUPPORT_EMAIL}`}>{t("about.contact")}</ExternalLink> <span className="muted">{SUPPORT_EMAIL}</span>
              </li>
              <li>
                <ExternalLink href={`${REPO_URL}/issues/new?template=translation.yml`}>{t("about.translation")}</ExternalLink>
              </li>
              <li>
                <ExternalLink href={donatePage(info.language)}>{t("about.donate")}</ExternalLink>
              </li>
            </ul>
            <p className="muted">
              {t("about.privacyShort")}
              <br />
              {t("about.version", { v: info.version })} · © 2026 Sergey Yadrov · MIT
            </p>
          </Section>
        </>
      )}
    </>
  );
}

/** "Why I made Unslouch": the author's photo and story, then "buy me a coffee" that opens the site's support page.
 * The same texts as on the site. The food diary's name is a link only in CIS languages, where the app promotes it. */
function Story({ info }: { info: AppInfo }) {
  const { t } = useTranslation();
  const MZR = "\u0000";
  const paragraphs = t("story.paragraphs", {
    returnObjects: true,
    mzr: MZR,
  }) as string[];
  return (
    <Section title={t("story.title")}>
      <div className="story">
        <img className="story__photo" src={authorPhoto} width={96} height={96} alt={t("story.photoAlt")} />
        <div>
          {paragraphs.map((text, i) => {
            const [before, after] = text.split(MZR);
            if (after === undefined) return <p key={i}>{text}</p>;
            return (
              <p key={i}>
                {before}
                {info.isCis ? <ExternalLink href={`${info.mzrUrl}&utm_content=story`}>{t("story.mzr")}</ExternalLink> : t("story.mzr")}
                {after}
              </p>
            );
          })}
          <p>{t("story.support", { name: t("app.name") })}</p>
          <button className="button button--primary" onClick={() => openUrl(donatePage(info.language))}>
            {t("story.supportButton")}
          </button>
        </div>
      </div>
    </Section>
  );
}
