import { useState } from "react";
import type { Dict } from "../../i18n/en";

type T = Dict["tools"]["eyeCheck"];
type TipKey = keyof T["tips"];

/** Which tip each question leads to. */
const TIP_FOR: TipKey[] = ["dry", "dry", "blur", "blur", "headache", "squint", "setup", "long"];

export default function EyeCheck({ t }: { t: T }) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => t.questions.map(() => null));
  const complete = answers.every((a) => a !== null);
  const yes = answers.filter((a) => a === true).length;
  const tips = [...new Set(TIP_FOR.filter((_, i) => answers[i] === true))];
  const set = (i: number, v: boolean) => setAnswers(answers.map((a, j) => (j === i ? v : a)));

  return (
    <div className="tool eyecheck">
      <ol className="questions">
        {t.questions.map((q, i) => (
          <li key={i} className="question">
            <span className="question__text">{q}</span>
            <span className="segmented" role="radiogroup" aria-label={q}>
              <button type="button" role="radio" aria-checked={answers[i] === true} onClick={() => set(i, true)}>
                {t.yes}
              </button>
              <button type="button" role="radio" aria-checked={answers[i] === false} onClick={() => set(i, false)}>
                {t.no}
              </button>
            </span>
          </li>
        ))}
      </ol>
      {complete && (
        <div className={`result ${yes >= 4 ? "result--high" : yes > 0 ? "result--mid" : "result--low"}`} aria-live="polite">
          <h3>{t.result}</h3>
          <p>{yes === 0 ? t.none : yes >= 4 ? t.many : t.some}</p>
          {tips.length > 0 && (
            <ul>
              {tips.map((k) => (
                <li key={k}>{t.tips[k]}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="doctor">
        <h3>{t.doctorTitle}</h3>
        <ul>
          {t.doctor.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="tool-note">{t.notDiagnosis}</p>
      </div>
      {answers.some((a) => a !== null) && (
        <button type="button" className="btn btn--ghost" onClick={() => setAnswers(t.questions.map(() => null))}>
          {t.again}
        </button>
      )}
    </div>
  );
}
