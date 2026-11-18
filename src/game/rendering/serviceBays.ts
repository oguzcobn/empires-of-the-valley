import type { BuildingId } from '../core/types';

export type ServiceVehicle = 'ambulance' | 'police';

/**
 * Parking bays on the forecourt of emergency buildings, in tile units from the footprint's
 * origin. The building art paints the bays and the emergency fleet parks its vehicles on them,
 * so both must read the same numbers.
 */
export const SERVICE_BAYS: Partial<Record<BuildingId, { vehicle: ServiceVehicle; bays: readonly (readonly [number, number])[] }>> = {
  hospital: { vehicle: 'ambulance', bays: [[0.62, 1.62], [1.4, 1.62]] },
  police_station: { vehicle: 'police', bays: [[0.55, 1.62], [1.3, 1.62]] },
};

/** Vehicles a service building fields with its current staff. */
export const fleetSize = (id: BuildingId, workers: number): number => {
  const spec = SERVICE_BAYS[id];
  return spec ? Math.max(0, Math.min(spec.bays.length, workers)) : 0;
};
