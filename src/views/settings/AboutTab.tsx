import { useTranslation } from "react-i18next";
import { AppInfo, REPO_URL, SITE_URL, SUPPORT_EMAIL, donatePage } from "../../api";
import { ExternalLink, Section } from "./ui";

export function AboutTab({ info }: { info: AppInfo }) {
  const { t } = useTranslation();
  const legal = info.language === "ru" ? "ru" : "en";
  return (
    <Section title={t("app.name")}>
      <p>{t("about.text")}</p>
      <p>
        {t("about.author")}
        {info.isCis && (
          <>
            , <ExternalLink href={`${info.mzrUrl}&utm_content=about`}>{t("about.authorMzr")}</ExternalLink>
          </>
        )}
      </p>
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
          <ExternalLink href={`mailto:${SUPPORT_EMAIL}`}>{t("about.contact")}</ExternalLink>{" "}
          <span className="muted">{SUPPORT_EMAIL}</span>
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
  );
}
