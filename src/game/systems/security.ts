import type { GameState, Province } from '../core/types';
import { logEvent } from './events';
import { isBuilt, isOperating, storageCaps } from './economy';

/**
 * Strategic region economy and abstract territorial defense.
 * Every conquered region adds modest production; guards cost upkeep.
 * No civilian harm simulation or real-world tactical guidance.
 */
export function securityDayEnd(s: GameState, p: Province): void {
  const districts = s.claimedDistricts?.length ?? 0;
  // Each employed barracks instructor trains one militia member per day.
  // Recruitment consumes real stocks, and its cap prevents save overflow.
  const instructors = p.buildings
    .filter((b) => b.definitionId === 'barracks' && isOperating(b))
    .reduce((sum, b) => sum + b.workers, 0);
  const recruits = Math.max(0, Math.min(
    instructors,
    100 - (s.militia ?? 0),
    Math.floor(p.stocks.gold / 2000),
    Math.floor(p.stocks.food / 1000),
  ));
  if (recruits > 0) {
    const goldCost = recruits * 2000;
    const foodCost = recruits * 1000;
    p.stocks.gold -= goldCost;
    p.stocks.food -= foodCost;
    p.today.consumed.gold += goldCost;
    p.today.consumed.food += foodCost;
    s.militia = (s.militia ?? 0) + recruits;
    logEvent(s, 'success', 'event.militiaRecruited', { n: s.militia });
  }
  const guard = s.militia ?? 0;
  const caps = storageCaps(s, p);
  if (districts > 0) {
    const income = Math.min(districts * 750, Math.max(0, caps.gold - p.stocks.gold));
    const food = Math.min(districts * 350, Math.max(0, caps.food - p.stocks.food));
    p.stocks.gold += income;
    p.stocks.food += food;
    p.today.produced.gold += income;
    p.today.produced.food += food;
  }
  const militiaWatch = (s.edicts ?? []).includes('militia_watch');
  if (guard > 0) {
    const upkeep = Math.min(p.stocks.gold, guard * (militiaWatch ? 50 : 40));
    p.stocks.gold -= upkeep;
    p.today.consumed.gold += upkeep;
  }

  if (s.mode !== 'campaign' || districts === 0) return;
  const day = Math.floor(s.tick / 24);
  // Deterministic campaign episode; no random attacks every frame at 4x speed.
  if (day < 45 || (day + s.seed % 29) % 40 !== 0) return;
  const towers = p.buildings.filter((b) => b.definitionId === 'watchtower' && isBuilt(b)).length;
  const defense = guard + towers * 5 + (s.armyOrder === 'patrol' ? 5 : 0) + (militiaWatch ? 10 : 0);
  const threat = 7 + districts * 2 + (day % 9);
  if (defense >= threat) {
    logEvent(s, 'success', 'event.raidDefended', { defenders: defense, attackers: threat });
  } else {
    const loss = Math.min(p.stocks.gold, Math.max(1000, (threat - defense) * 550));
    p.stocks.gold -= loss;
    p.today.consumed.gold += loss;
    logEvent(s, 'warning', 'event.raidDamage', { gold: loss / 1000 });
  }
}
