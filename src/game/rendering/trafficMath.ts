/** Side offsets in logical tile coordinates; keeps sprites inside their road tile. */
export function vehicleLaneOffset(dx: number, dy: number, leftSideDriving: boolean): [number, number] {
  const side = leftSideDriving ? -0.13 : 0.13;
  return [-dy * side, dx * side];
}
export function pedestrianSidewalkOffset(dx: number, dy: number, sideSign: number): [number, number] {
  const side = sideSign < 0 ? -0.30 : 0.30;
  return [-dy * side, dx * side];
}
