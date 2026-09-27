import { useTranslation } from "react-i18next";
import { EXERCISES, Exercise, exerciseSeconds } from "../exercises/catalog";
import { Visual } from "../exercises/Visual";
import { locate, useElapsed } from "../exercises/useProgram";

/** All exercises side by side, animated in a loop. For review and for the website. */
export function GalleryView({ only, steps }: { only?: string[]; steps?: boolean }) {
  const { t } = useTranslation();
  const list = only?.length ? EXERCISES.filter((e) => only.includes(e.id)) : EXERCISES;
  if (steps) {
    // Every step of every exercise side by side, no animation: for review.
    return (
      <div className="gallery">
        {list.flatMap((e) =>
          e.steps.map((s) => (
            <figure className="gallery__card" key={`${e.id}-${s.key}`}>
              <div className="gallery__visual">
                <Visual visual={s.visual} />
              </div>
              <figcaption>
                <b>{t(`ex.${e.id}.title`)}</b>
                <span>{t(`ex.${e.id}.${s.key}`)}</span>
              </figcaption>
            </figure>
          )),
        )}
      </div>
    );
  }
  return (
    <div className="gallery">
      {list.map((e) => (
        <Card key={e.id} exercise={e} />
      ))}
    </div>
  );
}

function Card({ exercise }: { exercise: Exercise }) {
  const { t } = useTranslation();
  const elapsed = useElapsed();
  const total = exerciseSeconds(exercise);
  const at = locate([exercise], elapsed % total)!;
  return (
    <figure className="gallery__card">
      <div className="gallery__visual">
        <Visual visual={at.step.visual} />
      </div>
      <figcaption>
        <b>{t(`ex.${exercise.id}.title`)}</b>
        <span>{t(`ex.${exercise.id}.${at.step.key}`)}</span>
      </figcaption>
    </figure>
  );
}
