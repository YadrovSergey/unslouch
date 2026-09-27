import { Arrow, Figure } from "./Figure";
import { Hand } from "./Hand";
import type { Visual as VisualType } from "./catalog";

export function Eye({ state }: { state: "open" | "closed" | "squeeze" }) {
  return (
    <svg
      className={`eye ${state === "open" ? "eye--open" : "eye--closed"} ${state === "squeeze" ? "eye--squeeze" : ""}`}
      viewBox="0 0 200 120"
      aria-hidden="true"
    >
      <g className="eye__ball">
        <path d="M10 60 Q100 -10 190 60 Q100 130 10 60 Z" className="eye__white" />
        <circle cx="100" cy="60" r="26" className="eye__iris" />
        <circle cx="100" cy="60" r="12" className="eye__pupil" />
      </g>
      <path d="M10 60 Q100 100 190 60" className="eye__lid" />
      <g className="eye__lashes">
        <path d="M50 78 l-8 14 M100 88 v16 M150 78 l8 14" />
      </g>
    </svg>
  );
}

/** A circle that grows on the inhale and shrinks on the exhale: the user breathes along without reading. */
function Breath({ phase }: { phase: "in" | "out" }) {
  return (
    <svg className={`breath breath--${phase}`} viewBox="0 0 200 200" aria-hidden="true">
      <circle className="breath__guide" cx="100" cy="100" r="80" />
      <circle className="breath__ball" cx="100" cy="100" r="80" />
    </svg>
  );
}

function Walk() {
  return (
    <div className="walk">
      <Figure pose={{ view: "side", armL: [-25, 25], armR: [25, 25], legL: [-22, 10, 0], legR: [20, 25, 0] }} />
    </div>
  );
}

/** Seated twist from above: hips stay, the shoulders and head turn. */
function Twist({ angle }: { angle: number }) {
  return (
    <svg className="fig twist" viewBox="0 0 200 200" aria-hidden="true">
      <g className="fig__chair">
        <rect x={62} y={70} width={76} height={70} rx={10} className="twist__seat" />
      </g>
      <line className="twist__hips" x1={74} y1={105} x2={126} y2={105} />
      <g className="twist__upper" style={{ transform: `rotate(${angle}deg)` }}>
        <line x1={52} y1={105} x2={148} y2={105} />
        <circle cx={100} cy={105} r={17} className="fig__head" />
        <circle cx={100} cy={88} r={4} className="fig__eye" />
      </g>
      {angle !== 0 && (
        <g transform={`translate(100 105) rotate(${angle > 0 ? 0 : 180})`}>
          <path className="twist__path" d="M 62 -30 A 70 70 0 0 1 62 30" />
          <Arrow x={60} y={33} dir={angle > 0 ? 110 : 110} />
        </g>
      )}
    </svg>
  );
}

export function Visual({ visual }: { visual: VisualType }) {
  switch (visual.type) {
    case "figure":
      return <Figure pose={visual.pose} />;
    case "hand":
      return <Hand pose={visual.pose} />;
    case "eye":
      return <Eye state={visual.state} />;
    case "breath":
      return <Breath phase={visual.phase} />;
    case "walk":
      return <Walk />;
    case "twist":
      return <Twist angle={visual.angle} />;
  }
}
