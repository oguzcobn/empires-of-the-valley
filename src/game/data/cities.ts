import type { ArchitectureStyle, LandmarkId } from '../core/types';

export type CityId = 'trabzon' | 'edinburgh' | 'kyoto' | 'prague';
export interface CityInfo {
  id: CityId;
  name: string;
  culture: ArchitectureStyle;
  leader: string;
  leaderTitle: string;
  landmark: LandmarkId;
  /** Whether all city-specific art, gameplay and localization are ready for new games. */
  playable: boolean;
  districts: readonly string[];
}

/** Real place names; Edinburgh districts are neighbourhoods/wards rather than Turkish-style municipalities. */
export const CITIES: Record<CityId, CityInfo> = {
  trabzon: {
    id: 'trabzon', name: 'Trabzon', culture: 'turkish', playable: true,
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
    id: 'edinburgh', name: 'Edinburgh', culture: 'scottish', playable: true,
    leader: 'Jane Meagher', leaderTitle: 'City of Edinburgh Council Leader',
    landmark: 'scott_monument',
    districts: [
      'Old Town','Leith','Portobello','Morningside','Corstorphine','New Town',
      'Stockbridge','Newington','Craigmillar','South Queensferry','Cramond','Liberton',
      'Murrayfield','Gorgie','Dalry','Bruntsfield','Haymarket','Inverleith',
      'Duddingston','Joppa','Colinton','Blackford','Marchmont','Restalrig',
    ],
  },
  kyoto: {
    id: 'kyoto', name: 'Kyoto', culture: 'japanese', playable: false,
    leader: 'Kent Meclisi', leaderTitle: 'Tarihî Japon Şehri',
    // Temporary preview fallback; replace with a Japanese landmark before unlocking.
    landmark: 'scott_monument',
    districts: [
      'Higashiyama','Arashiyama','Gion','Fushimi','Nishijin','Kamigyo',
      'Nakagyo','Shimogyo','Sakyo','Ukyo','Yamashina','Nishikyo',
      'Kita','Minami','Katsura','Ohara','Kurama','Takao',
      'Saga','Kiyomizu','Demachiyanagi','Okazaki','Uji','Yase',
    ],
  },
  prague: {
    id: 'prague', name: 'Prague', culture: 'medieval_european', playable: false,
    leader: 'Kent Meclisi', leaderTitle: 'Orta Çağ Avrupa Şehri',
    // Temporary preview fallback; replace with a Prague landmark before unlocking.
    landmark: 'edinburgh_castle',
    districts: [
      'Stare Mesto','Mala Strana','Hradcany','Nove Mesto','Vysehrad','Josefov',
      'Vinohrady','Zizkov','Karlin','Smichov','Holesovice','Dejvice',
      'Brevnov','Liben','Troja','Vrsovice','Nusle','Podoli',
      'Strahov','Letna','Petrin','Andel','Bubenec','Vysocany',
    ],
  },
};

export const cityForCulture = (culture: ArchitectureStyle): CityId =>
  culture === 'scottish' ? 'edinburgh' : culture === 'japanese' ? 'kyoto' : culture === 'medieval_european' ? 'prague' : 'trabzon';

export function cityOf(cityId: CityId | undefined, culture: ArchitectureStyle): CityInfo {
  return CITIES[cityId ?? cityForCulture(culture)];
}

/** Region layout preserves save compatibility with the existing 24-hex world. */
export function districtName(cityId: CityId | undefined, culture: ArchitectureStyle, index: number): string {
  const city = cityOf(cityId, culture);
  return city.districts[index] ?? `Bölge ${index + 1}`;
}
