import { useTranslation } from "react-i18next";
import ru from "../../../CHANGELOG.ru.md?raw";
import en from "../../../CHANGELOG.md?raw";
import { Section } from "./ui";

interface Release {
  title: string;
  lines: { list: boolean; text: string }[];
}

/** The repository's CHANGELOG, built into the app: "## version — date" sections with "- " lines. */
function parse(md: string): Release[] {
  const out: Release[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) out.push({ title: line.slice(3), lines: [] });
    else if (out.length && line.startsWith("- ")) out[out.length - 1].lines.push({ list: true, text: line.slice(2) });
    else if (out.length && line) out[out.length - 1].lines.push({ list: false, text: line });
  }
  return out;
}

/** Russian for Russian, English for everyone else: the changelog is written in these two. */
export function Changelog({ language }: { language: string }) {
  const { t } = useTranslation();
  const releases = parse(language === "ru" ? ru : en);
  return (
    <Section title={t("changelog.title")}>
      {language !== "ru" && language !== "en" && <p className="muted section__lead">{t("changelog.englishOnly")}</p>}
      {releases.map((r) => (
        <div key={r.title} className="changelog">
          <h3>{r.title}</h3>
          {r.lines.some((l) => l.list) && (
            <ul>
              {r.lines
                .filter((l) => l.list)
                .map((l) => (
                  <li key={l.text}>{l.text}</li>
                ))}
            </ul>
          )}
          {r.lines
            .filter((l) => !l.list)
            .map((l) => (
              <p key={l.text}>{l.text}</p>
            ))}
        </div>
      ))}
    </Section>
  );
}
