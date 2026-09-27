import type { HandPose } from "./Hand";
import type { Pose } from "./Figure";

export type Section = "eyes" | "neck" | "back" | "hands" | "legs" | "breath";

export type Visual =
  | { type: "figure"; pose: Pose }
  | { type: "hand"; pose: HandPose }
  | { type: "eye"; state: "open" | "closed" | "squeeze" }
  | { type: "breath"; phase: "in" | "out" }
  | { type: "walk" }
  /** Seen from above: the shoulder line turns against the hips. */
  | { type: "twist"; angle: number };

export interface Step {
  /** i18n key under `ex.<id>.` */
  key: string;
  sec: number;
  visual: Visual;
}

export interface Exercise {
  id: string;
  section: Section;
  /** micro: fits a 20-second micro-break; movement: part of the stand-up break; strength: the daily neck minutes. */
  level: "micro" | "movement" | "strength" | "breathing";
  steps: Step[];
  reps: number;
  /** Eyes closed or looking away: the step change is announced with a soft sound. */
  soundSteps?: boolean;
}

// ---------- poses ----------
const seatedSide: Pose = { view: "side", seated: true };
const seatedFront: Pose = { view: "front", seated: true };
const standSide: Pose = { view: "side" };
const standFront: Pose = { view: "front" };

const handOpen: HandPose = { fingers: [0, 0, 0], thumb: -10 };
const handWide: HandPose = { fingers: [-12, 0, 0], thumb: -35 };
const handFist: HandPose = { fingers: [95, 100, 70], thumb: 50 };
const handHook: HandPose = { fingers: [0, 100, 90], thumb: 0 };
const handTable: HandPose = { fingers: [90, 0, 0], thumb: 0 };
const handStraightFist: HandPose = { fingers: [90, 95, 0], thumb: 30 };

const f = (pose: Pose): Visual => ({ type: "figure", pose });
const h = (pose: HandPose): Visual => ({ type: "hand", pose });

export const EXERCISES: Exercise[] = [
  // ---------- eyes ----------
  {
    id: "blink",
    section: "eyes",
    level: "micro",
    reps: 5,
    soundSteps: true,
    steps: [
      { key: "close", sec: 2, visual: { type: "eye", state: "closed" } },
      { key: "squeeze", sec: 2, visual: { type: "eye", state: "squeeze" } },
      { key: "open", sec: 2, visual: { type: "eye", state: "open" } },
    ],
  },

  // ---------- neck and shoulders ----------
  {
    id: "chinTuck",
    section: "neck",
    level: "micro",
    reps: 5,
    steps: [
      { key: "tuck", sec: 5, visual: f({ ...seatedSide, headShift: 9, arrow: { x: 124, y: 52, dir: 180 } }) },
      { key: "release", sec: 2, visual: f(seatedSide) },
    ],
  },
  {
    id: "shoulderBlades",
    section: "neck",
    level: "micro",
    reps: 5,
    steps: [
      { key: "squeeze", sec: 5, visual: f({ ...seatedSide, torso: -4, armL: [-25, 30], armR: [-25, 30] }) },
      { key: "release", sec: 2, visual: f(seatedSide) },
    ],
  },
  {
    id: "shrugs",
    section: "neck",
    level: "micro",
    reps: 6,
    steps: [
      { key: "up", sec: 2, visual: f({ ...seatedFront, shrug: 7, arrow: { x: 134, y: 92, dir: -90 } }) },
      { key: "down", sec: 2, visual: f(seatedFront) },
    ],
  },
  {
    id: "sideTilt",
    section: "neck",
    level: "micro",
    reps: 1,
    steps: [
      { key: "right", sec: 15, visual: f({ ...seatedFront, head: 28 }) },
      { key: "center", sec: 2, visual: f(seatedFront) },
      { key: "left", sec: 15, visual: f({ ...seatedFront, head: -28 }) },
    ],
  },
  {
    id: "headTurns",
    section: "neck",
    level: "micro",
    reps: 3,
    steps: [
      { key: "right", sec: 3, visual: f({ ...seatedFront, headTurn: 1 }) },
      { key: "left", sec: 3, visual: f({ ...seatedFront, headTurn: -1 }) },
    ],
  },

  // ---------- back ----------
  {
    id: "standingExtension",
    section: "back",
    level: "movement",
    reps: 5,
    steps: [
      { key: "lean", sec: 3, visual: f({ ...standSide, torso: -20, head: -8, armL: [-50, 82], armR: [-50, 82], arrow: { x: 112, y: 40, dir: 200 } }) },
      { key: "return", sec: 2, visual: f({ ...standSide, armL: [-50, 82], armR: [-50, 82] }) },
    ],
  },
  {
    id: "seatedTwist",
    section: "back",
    level: "movement",
    reps: 1,
    steps: [
      { key: "right", sec: 12, visual: { type: "twist", angle: 40 } },
      { key: "center", sec: 2, visual: { type: "twist", angle: 0 } },
      { key: "left", sec: 12, visual: { type: "twist", angle: -40 } },
    ],
  },
  {
    id: "catCow",
    section: "back",
    level: "movement",
    reps: 5,
    steps: [
      { key: "round", sec: 3, visual: f({ ...seatedSide, torso: 22, head: 25, armL: [35, 20], armR: [35, 20] }) },
      { key: "arch", sec: 3, visual: f({ ...seatedSide, torso: -8, head: -15, armL: [35, 20], armR: [35, 20] }) },
    ],
  },

  // ---------- hands ----------
  {
    id: "fistOpen",
    section: "hands",
    level: "micro",
    reps: 8,
    steps: [
      { key: "fist", sec: 2, visual: h(handFist) },
      { key: "open", sec: 2, visual: h(handWide) },
    ],
  },
  {
    id: "tendonGlides",
    section: "hands",
    level: "micro",
    reps: 2,
    steps: [
      { key: "straight", sec: 3, visual: h(handOpen) },
      { key: "hook", sec: 3, visual: h(handHook) },
      { key: "fist", sec: 3, visual: h(handFist) },
      { key: "table", sec: 3, visual: h(handTable) },
      { key: "straightFist", sec: 3, visual: h(handStraightFist) },
    ],
  },
  {
    id: "flexorStretch",
    section: "hands",
    level: "micro",
    reps: 1,
    steps: [
      { key: "right", sec: 15, visual: h({ ...handOpen, wrist: -65, helper: true }) },
      { key: "left", sec: 15, visual: h({ ...handOpen, wrist: -65, helper: true }) },
    ],
  },
  {
    id: "extensorStretch",
    section: "hands",
    level: "micro",
    reps: 1,
    steps: [
      { key: "right", sec: 15, visual: h({ ...handFist, wrist: 65, helper: true }) },
      { key: "left", sec: 15, visual: h({ ...handFist, wrist: 65, helper: true }) },
    ],
  },
  {
    id: "shake",
    section: "hands",
    level: "micro",
    reps: 1,
    steps: [{ key: "shake", sec: 10, visual: h({ ...handOpen, shake: true }) }],
  },

  // ---------- legs ----------
  {
    id: "anklePumps",
    section: "legs",
    level: "movement",
    reps: 10,
    steps: [
      { key: "up", sec: 1, visual: f({ ...seatedSide, legL: [-90, 90, -30], legR: [-90, 90, -30] }) },
      { key: "down", sec: 1, visual: f({ ...seatedSide, legL: [-90, 90, 35], legR: [-90, 90, 35] }) },
    ],
  },
  {
    id: "calfRaises",
    section: "legs",
    level: "movement",
    reps: 10,
    steps: [
      { key: "up", sec: 2, visual: f({ ...standSide, desk: true, lift: 12, legL: [0, 0, 55], legR: [0, 0, 55], armL: [62, 8], armR: [62, 8], arrow: { x: 92, y: 172, dir: -90 } }) },
      { key: "down", sec: 2, visual: f({ ...standSide, desk: true, armL: [62, 8], armR: [62, 8] }) },
    ],
  },
  {
    id: "walk",
    section: "legs",
    level: "movement",
    reps: 1,
    steps: [{ key: "walk", sec: 60, visual: { type: "walk" } }],
  },

  // ---------- daily neck and shoulders strength (Andersen 2011: 2 minutes a day) ----------
  {
    id: "lateralRaise",
    section: "neck",
    level: "strength",
    reps: 12,
    steps: [
      { key: "up", sec: 2, visual: f({ ...standFront, armL: [85, 0], armR: [-85, 0] }) },
      { key: "down", sec: 2, visual: f(standFront) },
    ],
  },
  {
    id: "reverseFly",
    section: "neck",
    level: "strength",
    reps: 12,
    steps: [
      { key: "open", sec: 2, visual: f({ ...standSide, torso: 40, head: -20, legL: [-15, 20, 0], legR: [-15, 20, 0], armL: [-60, 0], armR: [-60, 0] }) },
      { key: "close", sec: 2, visual: f({ ...standSide, torso: 40, head: -20, legL: [-15, 20, 0], legR: [-15, 20, 0], armL: [40, 0], armR: [40, 0] }) },
    ],
  },
  {
    id: "shrugHold",
    section: "neck",
    level: "strength",
    reps: 10,
    steps: [
      { key: "up", sec: 3, visual: f({ ...standFront, shrug: 8 }) },
      { key: "down", sec: 2, visual: f(standFront) },
    ],
  },

  // ---------- breathing: about 6 breaths a minute ----------
  {
    id: "breathing",
    section: "breath",
    level: "breathing",
    reps: 6,
    soundSteps: true,
    steps: [
      { key: "in", sec: 4, visual: { type: "breath", phase: "in" } },
      { key: "out", sec: 6, visual: { type: "breath", phase: "out" } },
    ],
  },
];

export const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;

export const exerciseSeconds = (e: Exercise) => e.reps * e.steps.reduce((sum, s) => sum + s.sec, 0);

/** Micro-break exercises in rotation order, only from enabled sections: eyes, hands, neck, eyes, hands… */
export function microRotation(sections: Record<Section, boolean>): Exercise[] {
  const lists = (["eyes", "hands", "neck"] as Section[])
    .filter((s) => sections[s])
    .map((s) => EXERCISES.filter((e) => e.section === s && e.level === "micro"));
  const out: Exercise[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) out.push(l[i % l.length]);
  return out;
}

/** Stand-up break: one back exercise and one legs exercise, then walking for the rest. */
export function movementProgram(sections: Record<Section, boolean>, rotation: number): Exercise[] {
  const pick = (section: Section) => {
    const list = EXERCISES.filter((e) => e.section === section && e.level === "movement" && e.id !== "walk");
    return list.length ? list[rotation % list.length] : undefined;
  };
  return [sections.back ? pick("back") : undefined, sections.legs ? pick("legs") : undefined].filter(
    (e): e is Exercise => !!e,
  );
}
