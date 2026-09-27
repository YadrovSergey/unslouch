/**
 * Workstation measurements from body height, by average body proportions (popliteal height ≈ 0.25 H,
 * seated elbow ≈ 0.40 H, seated eye ≈ 0.69 H, standing elbow ≈ 0.63 H). Real bodies differ, so the result is
 * a starting point to check against the rules: elbows about 90°, feet flat, top of the screen at eye level
 * or a little below. Shared with the website tool.
 */
export interface DeskHeights {
  seat: number;
  desk: number;
  screenTop: number;
  standingDesk: number;
  screenDistance: [number, number];
}

export function deskHeights(heightCm: number): DeskHeights {
  const h = Math.min(220, Math.max(140, heightCm));
  const round = (v: number) => Math.round(v);
  const seat = round(h * 0.25);
  const eye = h * 0.695;
  return {
    seat,
    desk: round(h * 0.4),
    screenTop: round(eye - 3),
    standingDesk: round(h * 0.63),
    screenDistance: [50, 70],
  };
}
