import { useTranslation } from "react-i18next";
import { AppInfo, REPO_URL, SITE_URL } from "../../api";
import { ExternalLink, Section } from "./ui";

export function AboutTab({ info }: { info: AppInfo }) {
  const { t } = useTranslation();
  const legal = info.language === "ru" ? "ru" : "en";
  return (
    <Section title={t("app.name")}>
      <p>{t("about.text")}</p>
      <p className="notice">{t("about.disclaimer")}</p>
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
          <ExternalLink href={`${REPO_URL}/issues/new?template=translation.yml`}>{t("about.translation")}</ExternalLink>
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
