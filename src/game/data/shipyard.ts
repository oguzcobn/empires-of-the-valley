import { u } from '../core/fixed';
import type { Cost, VesselKind } from '../core/types';

/**
 * Shipbuilding. Orders are paid when placed and built by shipwrights (staffed shipyards); every
 * finished vessel has upkeep and a capped fleet size, so a fleet is an investment, not a fountain.
 */
export interface VesselSpec {
  cost: Cost;
  /** Shipwright-hours to finish (4 shipwrights x 24 h = 96 per day). */
  work: number;
  upkeepGold: number;
  /** Most vessels of this kind the city can operate. */
  cap: number;
  /** Fishing boats: food per day. Cargo ships: gold per day (needs a market). Yachts: attraction. */
  foodPerDay?: number;
  goldPerDay?: number;
  attraction?: number;
  /** Yachts can be sold to visiting buyers. */
  salePrice?: number;
}

export const VESSEL_KINDS: readonly VesselKind[] = ['fishing', 'cargo', 'yacht'];

export const VESSELS: Record<VesselKind, VesselSpec> = {
  fishing: { cost: { wood: u(30), tools: u(5) }, work: 96 * 5, upkeepGold: u(0.1), cap: 6, foodPerDay: u(3) },
  cargo: {
    cost: { wood: u(60), stone: u(10), tools: u(10), gold: u(20) },
    work: 96 * 10,
    upkeepGold: u(0.3),
    cap: 4,
    goldPerDay: u(2.5),
  },
  yacht: {
    cost: { wood: u(50), tools: u(15), gold: u(40) },
    work: 96 * 14,
    upkeepGold: u(0.4),
    cap: 6,
    attraction: 4,
    salePrice: u(110),
  },
};
export const MAX_ORDERS = 4;
