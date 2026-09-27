import { useEffect, useRef, useState } from "react";
import type { Exercise, Step } from "./catalog";

export interface Timeline {
  exercise: Exercise;
  step: Step;
  stepIndex: number;
  rep: number;
  /** Seconds left in the current step. */
  stepLeft: number;
  /** Seconds since the program started. */
  elapsed: number;
  done: boolean;
}

/** Where a sequence of exercises is at `elapsed` seconds. */
export function locate(program: Exercise[], elapsed: number): Timeline | null {
  let t = elapsed;
  for (const exercise of program) {
    for (let rep = 0; rep < exercise.reps; rep++) {
      for (let i = 0; i < exercise.steps.length; i++) {
        const step = exercise.steps[i];
        if (t < step.sec) {
          return { exercise, step, stepIndex: i, rep: rep + 1, stepLeft: step.sec - t, elapsed, done: false };
        }
        t -= step.sec;
      }
    }
  }
  return null;
}

/** A clock that ticks 10 times a second from mount. */
export function useElapsed(running = true): number {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(performance.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((performance.now() - start.current) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);
  return elapsed;
}
