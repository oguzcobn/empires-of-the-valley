/** Side offsets in logical tile coordinates; keeps sprites inside their road tile. */
export function vehicleLaneOffset(dx: number, dy: number, leftSideDriving: boolean): [number, number] {
  const side = leftSideDriving ? -0.13 : 0.13;
  const x = -dy * side, y = dx * side;
  return [x === 0 ? 0 : x, y === 0 ? 0 : y];
}
export function pedestrianSidewalkOffset(dx: number, dy: number, sideSign: number): [number, number] {
  const side = sideSign < 0 ? -0.30 : 0.30;
  const x = -dy * side, y = dx * side;
  return [x === 0 ? 0 : x, y === 0 ? 0 : y];
}

/**
 * Interpolate the previous legal lane into the new one when a car turns.
 * This prevents a visible sideways teleport on connected intersection tiles.
 */
export function smoothVehicleTurnOffset(
  prevDx: number, prevDy: number, dx: number, dy: number,
  progress: number, leftSideDriving: boolean,
): [number, number] {
  const incoming = prevDx === 0 && prevDy === 0
    ? vehicleLaneOffset(dx, dy, leftSideDriving)
    : vehicleLaneOffset(prevDx, prevDy, leftSideDriving);
  const outgoing = vehicleLaneOffset(dx, dy, leftSideDriving);
  const t = Math.max(0, Math.min(1, progress / 0.4));
  const blend = t * t * (3 - 2 * t);
  return [
    incoming[0] + (outgoing[0] - incoming[0]) * blend,
    incoming[1] + (outgoing[1] - incoming[1]) * blend,
  ];
}
