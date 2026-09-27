/**
 * A hand seen from the side, the way tendon-gliding exercises are usually drawn: forearm, a broad palm,
 * fingers with three joints, thumb. Angles are degrees; + bends toward the palm.
 */
export interface HandPose {
  /** Finger joints: knuckle, middle, tip. */
  fingers: [number, number, number];
  thumb: number;
  /** Wrist: + toward the palm (flexion), − back (extension). */
  wrist?: number;
  /** The other hand gently pulls the fingers (stretches). */
  helper?: boolean;
  shake?: boolean;
}

const PALM = 46;
const PHALANGES = [25, 18, 14];

function Chain({ angles, lens, className }: { angles: number[]; lens: number[]; className?: string }) {
  if (!lens.length) return null;
  return (
    <g style={{ transform: `rotate(${angles[0]}deg)` }} className={`hand__joint ${className ?? ""}`}>
      <line x1={0} y1={0} x2={lens[0]} y2={0} />
      <g transform={`translate(${lens[0]} 0)`}>
        <Chain angles={angles.slice(1)} lens={lens.slice(1)} />
      </g>
    </g>
  );
}

export function Hand({ pose }: { pose: HandPose }) {
  const [a, b, c] = pose.fingers;
  const wrist = pose.wrist ?? 0;
  return (
    <svg className={`hand ${pose.shake ? "hand--shake" : ""}`} viewBox="0 0 200 200" aria-hidden="true">
      <g className="hand__rig">
        <line className="hand__arm" x1={0} y1={100} x2={62} y2={100} />
        <g className="hand__joint" style={{ transform: `translate(62px, 100px) rotate(${wrist}deg)` }}>
          <line className="hand__palm" x1={0} y1={0} x2={PALM} y2={0} />
          {/* Back fingers, a little lighter, then the front finger. */}
          <g transform={`translate(${PALM} -6)`} className="hand__back">
            <Chain angles={[a, b, c]} lens={PHALANGES} />
          </g>
          <g transform={`translate(${PALM} 4)`}>
            <Chain angles={[a, b, c]} lens={PHALANGES} />
          </g>
          <g transform="translate(10 -12)">
            <Chain angles={[-40 + pose.thumb, 10]} lens={[20, 14]} />
          </g>
          {pose.helper && (
            <g transform={`translate(${PALM + 22} ${wrist < 0 ? 16 : -16})`}>
              <line className="hand__helper" x1={0} y1={0} x2={34} y2={wrist < 0 ? 14 : -14} />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
