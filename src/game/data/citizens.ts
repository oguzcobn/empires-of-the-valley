import type { CompanyRecord, GameState } from '../core/types';
import { cityOf } from './cities';
import { totalPopulation, homeProvince, isBuilt } from '../systems/economy';

const FIRST_TR = ['Oğuzhan','Mehmet','Ayşe','Ali','Fatma','Mustafa','Elif','Yusuf','Zeynep','Emre','Meryem','Burak','Derya','Seda','Hüseyin','Deniz','Ömer','Esra','Uğur'];
const LAST_TR = ['Çoban','Yılmaz','Kaya','Öztürk','Demir','Aydın','Şahin','Arslan','Koç','Kılıç','Aksoy','Karadeniz'];
const FIRST_SC = ['Eilidh','Callum','Isla','Finlay','Mairi','Hamish','Iona','Alistair','Fiona','Lewis','Ailsa','Angus','Rowan','Skye','Cameron','Morag'];
const LAST_SC = ['MacLeod','Stewart','Campbell','Fraser','MacDonald','Murray','Douglas','Robertson','Sinclair','Grant','Reid','Kerr'];
const JOBS = [
  'Gemi İnşa Mühendisi',
  'Mimar (Cadmatic & Rhino 3D)',
  'Kompozit Teknolojileri Uzmanı',
  'Seyahat & Etkinlik Uzmanı',
  'Otel & Resort Yöneticisi',
  'Tüccar',
  'Kaptan (SeaXplorer)',
  'İnşaatçı',
  'Çiftçi',
  'Zanaatkâr',
  'Girişimci',
];

export const COMPANY_SECTORS = [
  'Tersane & Denizcilik (Damen DSAn / ASBAŞ)',
  '5★ Resort & Otelcilik (Paloma Finesse & Grida)',
  'Su Parkı & Eğlence (Palomaqua & Splash Park)',
  'Gemi Mühendisliği (Cadmatic, Rhino 3D & IFS)',
  'Konyaaltı Partner Oteller (Porto Bello, Crowne Plaza, Sealife)',
  'Gastronomi & Marina (7 Mehmet, Vahap Usta, Lara Balık, Wabi Sabi)',
  'Uluslararası Sağlık (Olympos, Memorial & Akdeniz Hastanesi)',
  'Yenilenebilir Enerji & Solar Santral (GES)',
  'Mobilite & Lojistik (Setur Marina, Avis, Sixt, Tazı)',
] as const;

export const DOCUMENT_COMPANIES: Record<string, string[]> = {
  corporate_plaza: [
    'Damen Shipyards Antalya (DSAn) Mühendislik Merkezi',
    'ASBAŞ Antalya Serbest Bölge İşletmesi A.Ş.',
    'Paloma Hotels & Resort Holding (Finesse & Grida)',
    'DSAn Cadmatic & Rhino 3D Gemi Tasarım Ofisi',
    'Solar Power Yenilenebilir Enerji Santrali A.Ş.',
  ],
  shipyard: [
    'Damen Shipyards Antalya — DSA1-DSA6 Üretim & Refit',
    'DSAn 2000t Syncrolift & 560t Travel Lift Marina',
    'DSA5 SeaXplorer & Yacht Support Süperyat Tersanesi',
    'DSA6 BV Mode-I Kompozit Tekne Üretim Merkezi',
  ],
  hotel: [
    'Paloma Finesse Side 5★ Luxury Ultra All Inclusive',
    'Paloma Grida Belek Lagoon & Lake Suites',
    'Porto Bello Hotel Resort & Spa (Liman)',
    'Crowne Plaza & Sealife Family Resort Konyaaltı',
    'Fourhills Boutique Hotel & Mercure Konyaaltı',
  ],
  aquapark: [
    'Palomaqua 20-Slide Waterpark (Windigo & Looping Rocket)',
    'Grida Splash Park & Kids Aquatower Kompleksi',
  ],
  restaurant: [
    '7 Mehmet Modern Akdeniz Mutfağı',
    'Vahap Usta Et & Lara Balık Promenade',
    'Wabi Sabi, Quentine, Avare & Curio Fine Dining',
    'Ship Inn Setur Marina & Seraser Kaleiçi',
  ],
  hospital: [
    'Olympos International Hospital (7/24 Acil)',
    'Memorial JCI & Akdeniz Üniversitesi Hastanesi',
  ],
  factory: [
    'DSA3 Alüminyum & Çelik Blok Üretim Tesisleri',
    'ASBAŞ Endüstriyel Tedarik & Ekipman Fabrikası',
  ],
  market: [
    'Liman Serbest Bölge Ticaret & Döviz Merkezi',
    'Boğaçayı Finans & Bankacılık Çarşısı (İş, Garanti, Akbank)',
  ],
  airport: [
    'Antalya Uluslararası Havalimanı (AYT) VIP Transfer & Havacılık',
  ],
};

/** Stable generated citizen identities based on city, seed and ordinal; supports custom player-assigned names. */
export interface CitizenProfile {
  index: number;
  id: string;
  name: string;
  occupation: string;
  age: number;
  companyName?: string;
}

export function citizenAt(s: GameState, index: number): CitizenProfile {
  const scottish = cityOf(s.cityId, s.culture).id === 'edinburgh';
  const first = scottish ? FIRST_SC : FIRST_TR;
  const last = scottish ? LAST_SC : LAST_TR;
  const hash = (Math.imul(s.seed ^ (index + 1), 0x45d9f3b) ^ (index * 12343)) >>> 0;
  const generatedName = `${first[hash % first.length]} ${last[Math.floor(hash / 17) % last.length]}`;
  const custom = s.citizenNames?.[String(index)]?.trim();
  const founded = (s.companies ?? []).find((c) => c.founderIndex === index);
  return {
    index,
    id: `citizen-${index + 1}`,
    name: custom && custom.length > 0 ? custom : generatedName,
    occupation: founded ? `${founded.name} Kurucusu` : JOBS[Math.floor(hash / 31) % JOBS.length]!,
    age: 22 + (Math.floor(hash / 47) % 42),
    companyName: founded?.name,
  };
}

export function citizens(s: GameState, limit = 24): CitizenProfile[] {
  const n = Math.min(limit, totalPopulation(homeProvince(s)));
  return Array.from({ length: n }, (_, index) => citizenAt(s, index));
}

/**
 * Returns all active companies in the city: player/citizen-founded companies stored in `s.companies`
 * plus authentic document-inspired enterprises anchored to built plazas, shipyards, hotels, aquaparks,
 * hospitals, restaurants, factories & airports.
 */
export function cityCompanies(s: GameState): CompanyRecord[] {
  const p = homeProvince(s);
  const list: CompanyRecord[] = [...(s.companies ?? [])];
  const coveredBuildings = new Set(list.map((c) => c.buildingId).filter(Boolean));
  const commercial = p.buildings.filter(
    (b) =>
      isBuilt(b) &&
      [
        'corporate_plaza',
        'shipyard',
        'hotel',
        'aquapark',
        'restaurant',
        'hospital',
        'factory',
        'market',
        'airport',
      ].includes(b.definitionId),
  );
  commercial.forEach((b, idx) => {
    if (coveredBuildings.has(b.id)) return;
    const founderIdx = (idx * 3 + 1) % Math.max(1, totalPopulation(p));
    const names = DOCUMENT_COMPANIES[b.definitionId] ?? DOCUMENT_COMPANIES.corporate_plaza!;
    const companyTitle = names[(b.x + b.y + idx + b.level - 1) % names.length]!;
    const sector =
      b.definitionId === 'shipyard'
        ? COMPANY_SECTORS[0]
        : b.definitionId === 'hotel'
          ? b.level >= 3
            ? COMPANY_SECTORS[1]
            : COMPANY_SECTORS[4]
          : b.definitionId === 'aquapark'
            ? COMPANY_SECTORS[2]
            : b.definitionId === 'corporate_plaza'
              ? COMPANY_SECTORS[3]
              : b.definitionId === 'restaurant'
                ? COMPANY_SECTORS[5]
                : b.definitionId === 'hospital'
                  ? COMPANY_SECTORS[6]
                  : COMPANY_SECTORS[8];
    list.push({
      id: `auto-${b.id}`,
      name: companyTitle,
      sector,
      founderIndex: founderIdx,
      buildingId: b.id,
      level: b.level,
      employees: Math.max(2, b.workers),
    });
  });
  return list;
}