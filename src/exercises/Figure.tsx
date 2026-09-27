/**
 * A stick figure in the style of the app icon, built from joints. A pose is a set of angles; switching the pose
 * animates every joint by a CSS transition, so one component draws every body exercise.
 * Angles are degrees, clockwise, 0 = the limb hangs straight down (for the torso and head: straight up).
 */
export interface Pose {
  view: "front" | "side";
  seated?: boolean;
  /** Torso tilt: side view forward (+) / backward (−), front view to the right (+). */
  torso?: number;
  /** Head relative to the torso. */
  head?: number;
  /** Side view: head shift back (chin tuck), in units. */
  headShift?: number;
  /** Front view: shoulders raised, in units. */
  shrug?: number;
  /** Front view: torso turned (seated twist), −1..1, drawn as a narrower chest and shifted head. */
  twist?: number;
  armL?: [number, number];
  armR?: [number, number];
  legL?: [number, number, number?];
  legR?: [number, number, number?];
  /** Heels up, in units (calf raise). */
  lift?: number;
  /** Chest scale for breathing. */
  breath?: number;
  /** Front view: head turned left (−) / right (+), −1..1. */
  headTurn?: number;
  /** A desk in front (side view), for exercises that hold on to it. */
  desk?: boolean;
  /** Direction hint in figure coordinates: arrow from (x, y), `dir` in degrees (0 = right, 90 = down). */
  arrow?: { x: number; y: number; dir: number };
}

const U = {
  torso: 46,
  neck: 7,
  head: 11,
  upperArm: 25,
  forearm: 23,
  thigh: 30,
  shin: 30,
  foot: 11,
  shoulder: 13,
  hip: 7,
};

function Limb({ x, y, a1, a2, l1, l2, far, foot, hand }: {
  x: number;
  y: number;
  a1: number;
  a2: number;
  l1: number;
  l2: number;
  far?: boolean;
  foot?: number;
  hand?: boolean;
}) {
  return (
    <g className={far ? "fig__far" : undefined} transform={`translate(${x} ${y}) rotate(${a1})`}>
      <line x1={0} y1={0} x2={0} y2={l1} />
      <g transform={`translate(0 ${l1}) rotate(${a2})`}>
        <line x1={0} y1={0} x2={0} y2={l2} />
        {hand && <circle className="fig__hand" cx={0} cy={l2 + 2} r={5} />}
        {foot !== undefined && (
          <g transform={`translate(0 ${l2}) rotate(${foot})`}>
            <line className="fig__foot" x1={-2} y1={0} x2={U.foot} y2={0} />
          </g>
        )}
      </g>
    </g>
  );
}

export function Figure({ pose }: { pose: Pose }) {
  const side = pose.view === "side";
  const seated = pose.seated ?? false;
  const lift = pose.lift ?? 0;
  const hipY = seated ? (side ? 120 : 132) : 106 - lift;
  const hipX = 100;
  const shrug = pose.shrug ?? 0;
  const twist = pose.twist ?? 0;
  const breath = pose.breath ?? 1;
  const shoulderHalf = side ? 0 : U.shoulder * (1 - Math.abs(twist) * 0.45);
  const legL = pose.legL ?? (seated ? (side ? [-90, 90, 0] : [0, 0]) : [side ? 0 : 6, 0, 0]);
  const legR = pose.legR ?? (seated ? (side ? [-90, 90, 0] : [0, 0]) : [side ? 0 : -6, 0, 0]);
  const armL = pose.armL ?? [10, side ? 20 : 0];
  const armR = pose.armR ?? [side ? 10 : -10, side ? 20 : 0];

  return (
    <svg className="fig" viewBox="0 0 200 200" aria-hidden="true">
      <ellipse className="fig__shadow" cx={100} cy={seated ? 183 : 169} rx={side ? 46 : 38} ry={5} />
      {pose.desk && side && (
        <g className="fig__chair">
          <rect className="fig__prop" x={134} y={86} width={56} height={9} rx={4} />
          <line x1={182} y1={94} x2={182} y2={167} />
        </g>
      )}
      {seated && (
        <g className="fig__chair">
          {side ? (
            <>
              <rect className="fig__prop" x={hipX - 18} y={124} width={48} height={8} rx={4} />
              <rect className="fig__prop" x={hipX - 24} y={72} width={8} height={56} rx={4} transform={`rotate(-6 ${hipX - 20} 128)`} />
              <line x1={hipX + 20} y1={130} x2={hipX + 24} y2={181} />
              <line x1={hipX - 8} y1={130} x2={hipX - 12} y2={181} />
            </>
          ) : (
            <>
              <rect className="fig__prop" x={hipX - 30} y={60} width={60} height={70} rx={10} />
              <rect className="fig__prop fig__prop--seat" x={hipX - 32} y={130} width={64} height={8} rx={4} />
              <line x1={hipX - 24} y1={138} x2={hipX - 26} y2={181} />
              <line x1={hipX + 24} y1={138} x2={hipX + 26} y2={181} />
            </>
          )}
        </g>
      )}
      {/* Far limbs first, then the body, then the near limbs on top. */}
      {side && <Limb x={hipX} y={hipY} a1={legR[0]} a2={legR[1]} l1={U.thigh} l2={U.shin} far foot={legR[2] ?? 0} />}
      <g className="fig__body" transform={`translate(${hipX} ${hipY}) rotate(${pose.torso ?? 0})`}>
        {side && (
          <Limb x={0} y={-U.torso - shrug} a1={-armR[0]} a2={-armR[1]} l1={U.upperArm} l2={U.forearm} far hand />
        )}
        <line className="fig__torso" x1={0} y1={-2} x2={0} y2={-U.torso + 2} transform={`scale(${breath} 1)`} />
        {!side && <line x1={-shoulderHalf} y1={-U.torso - shrug} x2={shoulderHalf} y2={-U.torso - shrug} />}
        <g
          transform={`translate(${side ? -(pose.headShift ?? 0) : twist * 5 + (pose.headTurn ?? 0) * 4} ${-U.torso - U.neck}) rotate(${pose.head ?? 0})`}
        >
          <line x1={0} y1={0} x2={0} y2={U.neck} />
          <circle cx={0} cy={-U.head} r={U.head} className="fig__head" />
          {side && <circle cx={U.head * 0.55} cy={-U.head - 2} r={1.8} className="fig__eye" />}
          {!side && pose.headTurn !== undefined && (
            <circle cx={(pose.headTurn ?? 0) * U.head * 0.6} cy={-U.head - 2} r={1.8} className="fig__eye" />
          )}
        </g>
        {side ? (
          <Limb x={0} y={-U.torso - shrug} a1={-armL[0]} a2={-armL[1]} l1={U.upperArm} l2={U.forearm} hand />
        ) : (
          <>
            <Limb x={-shoulderHalf} y={-U.torso - shrug} a1={armL[0]} a2={armL[1]} l1={U.upperArm} l2={U.forearm} hand />
            <Limb x={shoulderHalf} y={-U.torso - shrug} a1={armR[0]} a2={armR[1]} l1={U.upperArm} l2={U.forearm} hand />
          </>
        )}
      </g>
      {side ? (
        <Limb x={hipX} y={hipY} a1={legL[0]} a2={legL[1]} l1={U.thigh} l2={U.shin} foot={legL[2] ?? 0} />
      ) : (
        <>
          <Limb x={hipX - U.hip} y={hipY} a1={legL[0] + (seated ? 20 : 0)} a2={legL[1] - (seated ? 20 : 0)} l1={seated ? 12 : U.thigh} l2={U.shin} />
          <Limb x={hipX + U.hip} y={hipY} a1={legR[0] - (seated ? 20 : 0)} a2={legR[1] + (seated ? 20 : 0)} l1={seated ? 12 : U.thigh} l2={U.shin} />
        </>
      )}
      {pose.arrow && <Arrow {...pose.arrow} />}
    </svg>
  );
}

/** Accent arrow that shows which way to move. */
export function Arrow({ x, y, dir }: { x: number; y: number; dir: number }) {
  return (
    <g className="fig__arrow" transform={`translate(${x} ${y}) rotate(${dir})`}>
      <line x1={0} y1={0} x2={18} y2={0} />
      <path d="M 12 -7 L 20 0 L 12 7" />
    </g>
  );
}
