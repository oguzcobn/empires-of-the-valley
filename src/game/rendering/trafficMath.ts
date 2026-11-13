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
