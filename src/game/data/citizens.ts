import type { GameState } from '../core/types';
import { cityOf } from './cities';
import { totalPopulation, homeProvince } from '../systems/economy';

const FIRST_TR = ['Mehmet','Ayşe','Ali','Fatma','Mustafa','Elif','Yusuf','Zeynep','Emre','Meryem','Burak','Derya','Seda','Hüseyin','Deniz','Ömer','Esra','Uğur'];
const LAST_TR = ['Çoban','Yılmaz','Kaya','Öztürk','Demir','Aydın','Şahin','Arslan','Koç','Kılıç','Aksoy','Karadeniz'];
const FIRST_SC = ['Eilidh','Callum','Isla','Finlay','Mairi','Hamish','Iona','Alistair','Fiona','Lewis','Ailsa','Angus','Rowan','Skye','Cameron','Morag'];
const LAST_SC = ['MacLeod','Stewart','Campbell','Fraser','MacDonald','Murray','Douglas','Robertson','Sinclair','Grant','Reid','Kerr'];
const JOBS = ['Çiftçi', 'İnşaatçı', 'Oduncu', 'Zanaatkâr', 'Öğrenci', 'Tüccar', 'İşçi', 'Balıkçı'];

/** Stable generated citizen identities based on city, seed and ordinal; no personally identifying data. */
export interface CitizenProfile { id: string; name: string; occupation: string; age: number; }
export function citizenAt(s: GameState, index: number): CitizenProfile {
  const scottish = cityOf(s.cityId, s.culture).id === 'edinburgh';
  const first = scottish ? FIRST_SC : FIRST_TR;
  const last = scottish ? LAST_SC : LAST_TR;
  const hash = (Math.imul(s.seed ^ (index + 1), 0x45d9f3b) ^ (index * 12343)) >>> 0;
  return {
    id: `citizen-${index + 1}`,
    name: `${first[hash % first.length]} ${last[Math.floor(hash / 17) % last.length]}`,
    occupation: JOBS[Math.floor(hash / 31) % JOBS.length]!,
    age: 18 + Math.floor(hash / 47) % 49,
  };
}

export function citizens(s: GameState, limit = 24): CitizenProfile[] {
  const n = Math.min(limit, totalPopulation(homeProvince(s)));
  return Array.from({ length: n }, (_, index) => citizenAt(s, index));
}
