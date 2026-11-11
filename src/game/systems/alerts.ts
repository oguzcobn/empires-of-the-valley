import { calendar, daysUntilWinter } from '../core/time';
import type { GameState, MessageParams } from '../core/types';
import type { TKey } from '../../i18n/tr';
import { FOOD_PER_CITIZEN_PER_DAY, WINTER_WARNING_DAYS } from '../data/balance';
import { defOf, specOf } from '../data/buildings';
import { TECH_IDS } from '../data/technologies';
import {
  computeFlows,
  homeProvince,
  housingCapacity,
  idleWorkers,
  isBuilt,
  isOperating,
  storageCaps,
  totalPopulation,
} from './economy';
import { tilesInRange } from './grid';

export interface Alert {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  key: TKey;
  params?: MessageParams;
  at?: { x: number; y: number };
}

/** Derived, always-current warnings. Nothing here is stored; it is recomputed from the state. */
export function computeAlerts(s: GameState): Alert[] {
  const p = homeProvince(s);
  const alerts: Alert[] = [];
  const pop = totalPopulation(p);
  const cap = housingCapacity(p);
  const flows = computeFlows(s);
  const caps = storageCaps(s, p);
  const dailyFood = pop * FOOD_PER_CITIZEN_PER_DAY;
  const foodDays = dailyFood > 0 ? Math.floor(p.stocks.food / dailyFood) : 99;
  const cal = calendar(s.tick);

  if (p.stocks.food <= 0) alerts.push({ id: 'famine', severity: 'danger', key: 'alert.famine' });
  else if (foodDays < 5 && flows.food.net < 0)
    alerts.push({ id: 'lowFood', severity: 'warning', key: 'alert.lowFood', params: { n: foodDays } });

  if (pop > cap)
    alerts.push({ id: 'homeless', severity: 'danger', key: 'alert.homeless', params: { n: pop - cap } });
  else if (pop === cap) alerts.push({ id: 'housingFull', severity: 'info', key: 'alert.housingFull' });

  const until = daysUntilWinter(s.tick);
  const winterNeed = dailyFood * 30;
  if (until > 0 && until <= WINTER_WARNING_DAYS * 2 && p.stocks.food < winterNeed) {
    alerts.push({
      id: 'winterFood',
      severity: 'warning',
      key: 'alert.winterFood',
      params: { n: until, need: Math.ceil(winterNeed / 1000) },
    });
  }

  let openSlots = 0;
  for (const b of p.buildings) {
    const at = { x: b.x, y: b.y };
    const name = `@building.${b.definitionId}.name`;
    if (!b.connected) {
      alerts.push({
        id: `disc-${b.id}`,
        severity: 'danger',
        key: 'alert.disconnected',
        params: { building: name },
        at,
      });
      continue;
    }
    if (!isBuilt(b)) continue;
    const spec = specOf(b);
    openSlots += spec.workerSlots - b.workers;
    if (b.unpaid)
      alerts.push({
        id: `unpaid-${b.id}`,
        severity: 'danger',
        key: 'alert.unpaid',
        params: { building: name },
        at,
      });
    else if (spec.workerSlots > 0 && b.workers === 0)
      alerts.push({
        id: `staff-${b.id}`,
        severity: 'warning',
        key: 'alert.unstaffed',
        params: { building: name },
        at,
      });
    const def = defOf(b);
    if (
      def.harvests &&
      isOperating(b) &&
      !tilesInRange(p, def, b.x, b.y).some((i) => p.tiles[i]!.deposit > 0)
    ) {
      alerts.push({
        id: `dep-${b.id}`,
        severity: 'warning',
        key: 'alert.depleted',
        params: { building: name },
        at,
      });
    }
    if (def.seasonal && cal.season === 'winter' && b.workers > 0) {
      alerts.push({ id: `winter-${b.id}`, severity: 'info', key: 'alert.winterFarm', at });
    }
  }
  const idle = idleWorkers(p);
  if (idle > 0 && openSlots > 0)
    alerts.push({ id: 'idle', severity: 'info', key: 'alert.idleWorkers', params: { n: idle } });

  for (const id of ['wood', 'stone', 'food'] as const) {
    if (p.stocks[id] >= caps[id] && flows[id].sources.length > 0) {
      alerts.push({
        id: `full-${id}`,
        severity: 'warning',
        key: 'alert.storageFull',
        params: { resource: `@resource.${id}` },
      });
    }
  }
  if (p.stocks.tools <= 0) alerts.push({ id: 'noTools', severity: 'danger', key: 'alert.noTools' });
  else if (p.stocks.tools < 3000) alerts.push({ id: 'toolsLow', severity: 'warning', key: 'alert.toolsLow' });

  const schoolWorking = p.buildings.some((b) => b.definitionId === 'school' && isOperating(b));
  if (
    schoolWorking &&
    s.researchQueue.length === 0 &&
    TECH_IDS.some((id) => !s.researchedTechIds.includes(id))
  ) {
    alerts.push({ id: 'researchIdle', severity: 'info', key: 'alert.researchIdle' });
  }
  const order = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
