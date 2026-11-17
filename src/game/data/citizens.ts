import type { CompanyRecord, GameState } from '../core/types';
import { cityOf } from './cities';
import { totalPopulation, homeProvince } from '../systems/economy';

const FIRST_TR = ['Oğuzhan','Mehmet','Ayşe','Ali','Fatma','Mustafa','Elif','Yusuf','Zeynep','Emre','Meryem','Burak','Derya','Seda','Hüseyin','Deniz','Ömer','Esra','Uğur'];
const LAST_TR = ['Çoban','Yılmaz','Kaya','Öztürk','Demir','Aydın','Şahin','Arslan','Koç','Kılıç','Aksoy','Karadeniz'];
const FIRST_SC = ['Eilidh','Callum','Isla','Finlay','Mairi','Hamish','Iona','Alistair','Fiona','Lewis','Ailsa','Angus','Rowan','Skye','Cameron','Morag'];
const LAST_SC = ['MacLeod','Stewart','Campbell','Fraser','MacDonald','Murray','Douglas','Robertson','Sinclair','Grant','Reid','Kerr'];
const JOBS = ['Çiftçi', 'İnşaatçı', 'Oduncu', 'Zanaatkâr', 'Öğrenci', 'Tüccar', 'İşçi', 'Balıkçı'];

/** Stable generated citizen identities based on city, seed and ordinal; no personally identifying data. */
export interface CitizenProfile { id: string; name: string; occupation: string; age: number; }
export const COMPANY_SECTORS = ['Tersane & Denizcilik', 'Otelcilik & Turizm', 'Gemi Mühendisliği', 'Gastronomi & Marina', 'Sağlık', 'Yenilenebilir Enerji', 'Mobilite & Lojistik'] as const;
const BUSINESS_NAMES: Partial<Record<string, readonly string[]>> = {
  corporate_plaza: ['Damen Shipyards Antalya Mühendislik Merkezi', 'ASBAŞ Serbest Bölge İşletmesi', 'DSAn Cadmatic & Rhino 3D Gemi Tasarım Ofisi', 'Solar Power Yenilenebilir Enerji'],
  shipyard: ['Damen DSA1–DSA6 Üretim & Refit', 'Damen Syncrolift & Travel Lift Marina', 'SeaXplorer Süperyat Tersanesi', 'BV Mode-I Kompozit Tekne Merkezi'],
  hotel: ['Paloma Finesse Side Resort', 'Paloma Grida Belek', 'Porto Bello Hotel Resort & Spa', 'Fourhills Boutique Hotel'],
  aquapark: ['Palomaqua Su Parkı', 'Grida Splash Park & Kids Aquatower'],
  restaurant: ['7 Mehmet Akdeniz Mutfağı', 'Vahap Usta & Lara Balık', 'Wabi Sabi Fine Dining', 'Ship Inn Setur Marina'],
  hospital: ['Olympos International Hospital', 'Memorial & Akdeniz Üniversitesi Hastanesi'],
  factory: ['DSA Alüminyum & Çelik Blok Üretimi', 'ASBAŞ Endüstriyel Tedarik Fabrikası'],
  market: ['Liman Serbest Bölge Ticaret Merkezi', 'Boğaçayı Finans & Bankacılık Çarşısı'],
  airport: ['Antalya Uluslararası Havalimanı'],
};
export function citizenAt(s: GameState, index: number): CitizenProfile {
  const scottish = cityOf(s.cityId, s.culture).id === 'edinburgh';
  const first = scottish ? FIRST_SC : FIRST_TR;
  const last = scottish ? LAST_SC : LAST_TR;
  const hash = (Math.imul(s.seed ^ (index + 1), 0x45d9f3b) ^ (index * 12343)) >>> 0;
  return {
    id: `citizen-${index + 1}`,
    name: s.citizenNames?.[String(index)]?.trim() || `${first[hash % first.length]} ${last[Math.floor(hash / 17) % last.length]}`,
    occupation: s.companies?.find((company) => company.founderIndex === index) ? `${s.companies.find((company) => company.founderIndex === index)!.name} Kurucusu` : JOBS[Math.floor(hash / 31) % JOBS.length]!,
    age: 18 + Math.floor(hash / 47) % 49,
  };
}

export function cityCompanies(s: GameState): CompanyRecord[] {
  const p = homeProvince(s);
  const companies = [...(s.companies ?? [])];
  const assigned = new Set(companies.map((company) => company.buildingId).filter(Boolean));
  for (const [index, building] of p.buildings.filter((b) => b.state === 'active' && ['corporate_plaza','shipyard','hotel','aquapark','restaurant','hospital','factory','market','airport'].includes(b.definitionId)).entries()) {
    if (assigned.has(building.id)) continue;
    const names = BUSINESS_NAMES[building.definitionId] ?? BUSINESS_NAMES.corporate_plaza!;
    companies.push({ id: `auto-${building.id}`, name: names[(building.x + building.y + index + building.level - 1) % names.length]!, sector: COMPANY_SECTORS[index % COMPANY_SECTORS.length]!, founderIndex: index % Math.max(1, p.population.adults), buildingId: building.id, level: building.level, employees: Math.max(2, building.workers) });
  }
  return companies;
}

export function citizens(s: GameState, limit = 24): CitizenProfile[] {
  const n = Math.min(limit, totalPopulation(homeProvince(s)));
  return Array.from({ length: n }, (_, index) => citizenAt(s, index));
}
