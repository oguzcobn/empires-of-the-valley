import type { GameState } from '../core/types';
import { WORLD_BY_ID } from '../data/worldMap';

/** Deterministic auto-resolve: no wall-clock randomness or save-format changes. */
export interface BattleForecast {
  attackers: number;
  attackPower: number;
  defensePower: number;
  casualties: number;
  victory: boolean;
}

const BIOME_DEFENSE: Record<string, number> = {
  capital: 100,
  fertile_plain: 45,
  forest: 55,
  mountain: 90,
  river_valley: 65,
  coast: 55,
  steppe: 40,
  trade_crossroads: 70,
};

/** Army quality and defensive terrain determine the result before the order is issued. */
export function forecastBattle(game: Pick<GameState, 'seed' | 'tick' | 'militia' | 'claimedDistricts' | 'treaties'>, provinceId: string): BattleForecast | null {
  const province = WORLD_BY_ID[provinceId];
  if (!province) return null;
  const attackers = Math.max(0, Math.trunc(game.militia ?? 0));
  // Mix stable world and campaign inputs without mutating the game's PRNG.
  let hash = game.seed ^ Math.floor(game.tick / 24);
  for (const char of provinceId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  const modifier = ((hash >>> 0) % 21) - 10;
  const allies = Object.values(game.treaties ?? {}).filter((v) => v === 'alliance').length;
  const attackPower = attackers * 11 + modifier + allies * 20;
  const defensePower = (BIOME_DEFENSE[province.biome] ?? 60) + (game.claimedDistricts?.length ?? 0) * 5;
  const victory = attackers >= 5 && attackPower >= defensePower;
  const casualties = attackers === 0 ? 0 : Math.min(attackers, Math.max(1, Math.ceil(defensePower / (victory ? 45 : 25))));
  return { attackers, attackPower, defensePower, casualties, victory };
}
