import type { ArchitectureStyle } from '../core/types';

export type CityId = 'trabzon' | 'edinburgh';
export interface CityInfo {
  id: CityId;
  name: string;
  culture: 'turkish' | 'scottish';
  leader: string;
  leaderTitle: string;
  landmark: 'sumela_monastery' | 'scott_monument';
  districts: readonly string[];
}

/** Real place names; Edinburgh districts are neighbourhoods/wards rather than Turkish-style municipalities. */
export const CITIES: Record<CityId, CityInfo> = {
  trabzon: {
    id: 'trabzon', name: 'Trabzon', culture: 'turkish',
    leader: 'Ahmet Metin Genç', leaderTitle: 'Büyükşehir Belediye Başkanı',
    landmark: 'sumela_monastery',
    districts: [
      'Ortahisar','Akçaabat','Maçka','Araklı','Arsin','Yomra',
      'Sürmene','Of','Çaykara','Vakfıkebir','Beşikdüzü','Çarşıbaşı',
      'Düzköy','Tonya','Şalpazarı','Dernekpazarı','Köprübaşı','Hayrat',
      'Akçaabat Sahili','Çamburnu','Uzungöl','Söğütlü','Boztepe','Çal Mağarası',
    ],
  },
  edinburgh: {
    id: 'edinburgh', name: 'Edinburgh', culture: 'scottish',
    leader: 'Jane Meagher', leaderTitle: 'City of Edinburgh Council Leader',
    landmark: 'scott_monument',
    districts: [
      'Old Town','Leith','Portobello','Morningside','Corstorphine','New Town',
      'Stockbridge','Newington','Craigmillar','South Queensferry','Cramond','Liberton',
      'Murrayfield','Gorgie','Dalry','Bruntsfield','Haymarket','Inverleith',
      'Duddingston','Joppa','Colinton','Blackford','Marchmont','Restalrig',
    ],
  },
};

export const cityForCulture = (culture: ArchitectureStyle): CityId =>
  culture === 'scottish' ? 'edinburgh' : 'trabzon';

export function cityOf(cityId: CityId | undefined, culture: ArchitectureStyle): CityInfo {
  return CITIES[cityId ?? cityForCulture(culture)];
}

/** Region layout preserves save compatibility with the existing 24-hex world. */
export function districtName(cityId: CityId | undefined, culture: ArchitectureStyle, index: number): string {
  const city = cityOf(cityId, culture);
  return city.districts[index] ?? `Bölge ${index + 1}`;
}
