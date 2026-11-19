import type { BuildingId, CompanyRecord, GameState, Province } from '../core/types';
import { cityOf } from './cities';
import { totalPopulation, homeProvince, isBuilt, isHome, isOperating } from '../systems/economy';

const MEN_TR = ['Oğuzhan','Mehmet','Ali','Mustafa','Yusuf','Emre','Burak','Hüseyin','Ömer','Uğur','Kerem','Murat','Serkan','Hakan','Cem','Tolga','Kaan','Arda'];
const WOMEN_TR = ['Ayşe','Fatma','Elif','Zeynep','Meryem','Derya','Seda','Esra','Deniz','Ebru','Gamze','Selin','Büşra','Merve','Pınar','Nur','Hande','Cansu'];
const LAST_TR = ['Çoban','Yılmaz','Kaya','Öztürk','Demir','Aydın','Şahin','Arslan','Koç','Kılıç','Aksoy','Karadeniz','Çelik','Yıldız','Doğan','Erdem','Polat','Kurt'];
const MEN_SC = ['Callum','Finlay','Hamish','Alistair','Lewis','Angus','Cameron','Ewan','Fraser','Rory','Duncan','Craig','Euan','Gregor'];
const WOMEN_SC = ['Eilidh','Isla','Mairi','Iona','Fiona','Ailsa','Rowan','Skye','Morag','Kirsty','Catriona','Shona','Heather','Lorna'];
const LAST_SC = ['MacLeod','Stewart','Campbell','Fraser','MacDonald','Murray','Douglas','Robertson','Sinclair','Grant','Reid','Kerr','Henderson','Paterson'];

/** Job titles at each workplace, handed out to its workers in turn. */
const JOB_TITLES: Partial<Record<BuildingId, readonly string[]>> = {
  town_center: ['Belediye memuru', 'Muhtar'],
  farm: ['Çiftçi', 'Tarım işçisi'],
  terrace_farm: ['Çiftçi', 'Bağcı'],
  lumber_camp: ['Oduncu', 'Kereste ustası'],
  quarry: ['Taş ocağı işçisi', 'Taş ustası'],
  warehouse: ['Depo görevlisi', 'Forklift operatörü'],
  granary: ['Ambar memuru'],
  school: ['Öğretmen', 'Okul müdürü'],
  market: ['Kasiyer', 'Market müdürü', 'Reyon görevlisi'],
  inn: ['Hancı', 'Aşçı'],
  watchtower: ['Bekçi'],
  barracks: ['Er', 'Çavuş', 'Teğmen'],
  mosque: ['İmam', 'Müezzin'],
  church: ['Papaz', 'Kilise görevlisi'],
  theatre: ['Tiyatro oyuncusu', 'Sahne teknisyeni'],
  cinema: ['Sinema makinisti', 'Gişe görevlisi'],
  hospital: ['Doktor', 'Hemşire', 'Paramedik', 'Cerrah'],
  factory: ['Fabrika işçisi', 'Ustabaşı', 'Makine mühendisi', 'Kaynakçı'],
  hotel: ['Resepsiyonist', 'Kat görevlisi', 'Otel aşçısı', 'Otel müdürü'],
  club: ['DJ', 'Barmen', 'Güvenlik görevlisi'],
  restaurant: ['Aşçı', 'Garson', 'Şef'],
  airport: ['Pilot', 'Kabin memuru', 'Hava trafik kontrolörü', 'Yer hizmetleri görevlisi'],
  corporate_plaza: ['Mühendis', 'Muhasebeci', 'Proje yöneticisi', 'Yazılımcı'],
  apartment: ['Apartman görevlisi'],
  park: ['Bahçıvan'],
  gas_station: ['Pompacı', 'İstasyon müdürü'],
  pharmacy: ['Eczacı', 'Eczane teknisyeni'],
  bakery: ['Fırıncı', 'Pastacı'],
  bank: ['Bankacı', 'Veznedar', 'Şube müdürü'],
  mall: ['Satış danışmanı', 'Mağaza müdürü', 'Güvenlik görevlisi'],
  villa: ['Bahçıvan'],
  tea_garden: ['Çaycı', 'Garson'],
  post_office: ['Postacı', 'Gişe memuru'],
  gym: ['Antrenör', 'Fizyoterapist'],
  kindergarten: ['Okul öncesi öğretmeni'],
  university: ['Akademisyen', 'Araştırma görevlisi', 'Profesör'],
  museum: ['Müze rehberi', 'Küratör'],
  bazaar: ['Pazarcı', 'Manav'],
  hamam: ['Tellak', 'Natır'],
  library: ['Kütüphaneci'],
  wind_turbine: ['Rüzgâr türbini teknisyeni'],
  solar_farm: ['Enerji teknisyeni'],
  bus_depot: ['Otobüs şoförü', 'Bakım ustası'],
  aquapark: ['Cankurtaran', 'Animatör'],
  police_station: ['Polis memuru', 'Komiser', 'Trafik polisi'],
  fire_station: ['İtfaiye eri', 'İtfaiye çavuşu'],
  shipyard: ['Gemi kaynakçısı', 'Tersane mühendisi', 'Tekne boyacısı', 'Gemi inşa ustası', 'Kalite kontrol uzmanı'],
};

export type LifeStage = 'adult' | 'elder' | 'child';

/** Stable generated citizen identities based on city, seed and ordinal; no personally identifying data. */
export interface CitizenProfile {
  id: string;
  index: number;
  name: string;
  occupation: string;
  age: number;
  stage: LifeStage;
  woman: boolean;
  /** Building the citizen works at (adults with a job). */
  workplaceId?: string;
  /** Home the citizen lives in, when the town has housing. */
  homeId?: string;
}
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
interface Roster {
  slots: { buildingId: string; title: string }[];
  homes: string[];
  school: boolean;
}
const rosters = new WeakMap<Province, Roster>();

/** Job slots (one per assigned worker, in building order) and homes of the province. */
function roster(p: Province): Roster {
  const hit = rosters.get(p);
  if (hit) return hit;
  const slots: Roster['slots'] = [];
  for (const b of p.buildings) {
    if (!isOperating(b) || b.workers <= 0) continue;
    const titles = JOB_TITLES[b.definitionId] ?? ['İşçi'];
    for (let k = 0; k < b.workers; k++) slots.push({ buildingId: b.id, title: titles[k % titles.length]! });
  }
  const out: Roster = {
    slots,
    homes: p.buildings.filter((b) => isHome(b) && isBuilt(b)).map((b) => b.id),
    school: p.buildings.some((b) => b.definitionId === 'school' && isOperating(b)),
  };
  rosters.set(p, out);
  return out;
}

/**
 * Citizen number `index` of the home town. Adults come first (0 .. adults-1) and hold the town's
 * real jobs in order; then the elders (retired), then the children (pupils). Names and ages are
 * hashed from the map seed so the same person keeps them between sessions.
 */
const WOMEN_JP = ['Yuki', 'Haruka', 'Sakura', 'Aoi', 'Hana', 'Mei', 'Rin', 'Kana', 'Sora', 'Emi', 'Nana', 'Mio'];
const MEN_JP = ['Kenji', 'Haruto', 'Ren', 'Takumi', 'Sota', 'Daiki', 'Kaito', 'Riku', 'Yuto', 'Sho', 'Akira', 'Koji'];
const LAST_JP = ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato'];
const WOMEN_CZ = ['Tereza', 'Eliška', 'Anna', 'Adéla', 'Karolína', 'Klára', 'Lucie', 'Markéta', 'Barbora', 'Veronika'];
const MEN_CZ = ['Jakub', 'Jan', 'Tomáš', 'Matyáš', 'Lukáš', 'Ondřej', 'Vojtěch', 'Filip', 'Martin', 'Petr'];
const LAST_CZ = ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec'];

export function citizenAt(s: GameState, index: number): CitizenProfile {
  const cityId = cityOf(s.cityId, s.culture).id;
  const p = homeProvince(s);
  const { adults, elders } = p.population;
  const hash = (Math.imul(s.seed ^ (index + 1), 0x45d9f3b) ^ (index * 12343)) >>> 0;
  const woman = (hash >>> 3) % 2 === 1;
  const first =
    cityId === 'edinburgh' ? (woman ? WOMEN_SC : MEN_SC)
      : cityId === 'kyoto' ? (woman ? WOMEN_JP : MEN_JP)
        : cityId === 'prague' ? (woman ? WOMEN_CZ : MEN_CZ)
          : woman ? WOMEN_TR : MEN_TR;
  const last =
    cityId === 'edinburgh' ? LAST_SC
      : cityId === 'kyoto' ? LAST_JP
        : cityId === 'prague' ? LAST_CZ
          : LAST_TR;
  const stage: LifeStage = index < adults ? 'adult' : index < adults + elders ? 'elder' : 'child';
  const age = stage === 'adult' ? 20 + (Math.floor(hash / 47) % 45) : stage === 'elder' ? 65 + (Math.floor(hash / 47) % 25) : 4 + (Math.floor(hash / 47) % 14);
  const r = roster(p);
  const founded = s.companies?.find((company) => company.founderIndex === index);
  const slot = stage === 'adult' ? r.slots[index] : undefined;
  const occupation = founded ? `${founded.name} Kurucusu`
    : stage === 'elder' ? 'Emekli'
    : stage === 'child' ? (age >= 6 ? (r.school ? 'Öğrenci' : 'Okul çağında çocuk') : 'Okul öncesi çocuk')
    : slot ? slot.title : 'İş arıyor';
  const home = r.homes.length ? r.homes[index % r.homes.length] : undefined;
  return {
    id: `citizen-${index + 1}`,
    index,
    name: s.citizenNames?.[String(index)]?.trim() || `${first[hash % first.length]} ${last[Math.floor(hash / 17) % last.length]}`,
    occupation,
    age,
    stage,
    woman,
    ...(slot ? { workplaceId: slot.buildingId } : {}),
    ...(home ? { homeId: home } : {}),
  };
}

/** Indices of the citizens who work at a building, in the order its workers are listed. */
export function workersOf(s: GameState, buildingId: string): number[] {
  const p = homeProvince(s);
  const out: number[] = [];
  roster(p).slots.forEach((slot, i) => {
    if (slot.buildingId === buildingId && i < p.population.adults) out.push(i);
  });
  return out;
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
