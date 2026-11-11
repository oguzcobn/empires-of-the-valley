import type { MessageParams, MessageRef } from '../game/core/types';
import { tr } from './tr';
import type { TKey } from './tr';

export type { TKey };
export type Dictionary = Record<TKey, string>;

/**
 * Localization entry point. Turkish is the only shipped language in Phase 1; adding English
 * means adding `en.ts` typed as `Dictionary` and registering it here — no component changes.
 */
const dictionaries: Record<string, Dictionary> = { tr };
let active = 'tr';

export const setLanguage = (code: string): void => {
  if (dictionaries[code]) active = code;
};

const number = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** Translates a key. `{name}` placeholders are filled from params; '@key' params are translated. */
export function t(key: TKey, params?: MessageParams): string {
  const template = dictionaries[active]![key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) return `{${name}}`;
    if (typeof value === 'number') return number(value);
    return value.startsWith('@') ? t(value.slice(1) as TKey) : value;
  });
}

export const tm = (ref: MessageRef): string => t(ref.key, ref.params);

/** Whole units from milli-units, floored, e.g. stock display. */
export const fmtInt = (milli: number): string => Math.floor(milli / 1000).toLocaleString('tr-TR');
/** Signed daily rate with one decimal, e.g. "+4,0". */
export function fmtRate(milli: number): string {
  const v = milli / 1000;
  const digits = milli !== 0 && Math.abs(milli) % 100 !== 0 ? 2 : 1; // show small rates such as 0,06 honestly
  const s = Math.abs(v).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`;
}
export const fmtAmount = (milli: number): string =>
  (milli / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
