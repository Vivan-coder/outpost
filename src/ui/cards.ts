import { solarEvent } from '../data/moon.ts';
import { apollo } from '../data/apollo.ts';
import radlab from '../data/radlab.json' with { type: 'json' };
import radMeta from '../data/radlab.meta.json' with { type: 'json' };
import osdr from '../data/osdr.json' with { type: 'json' };
import { t, type TextKey } from '../i18n/en';

// Data cards: each real thing the player meets in the game. Real NASA data is always labelled real;
// the Apollo figures are labelled historical.
export type CardId = 'donkiFlare' | 'donkiCme' | 'donkiSep' | 'donkiKp' | 'radIss' | 'radMoon' | 'radMars' | 'osdrBone' | 'osdrMuscle' | 'osdrPlants' | 'apollo1972';
export const CARD_IDS: CardId[] = ['donkiFlare', 'donkiCme', 'donkiSep', 'donkiKp', 'radIss', 'radMoon', 'radMars', 'osdrBone', 'osdrMuscle', 'osdrPlants', 'apollo1972'];

export interface CardInfo { id: CardId; title: string; line: string; source: string; url: string; date: string; kind: 'real' | 'hist' }

const inst = radlab.instruments as Record<string, { meanUGyPerH: number }>;
const issRates = ['Lidal', 'REM-Lid', 'DosTel1'].map((k) => inst[k].meanUGyPerH);
export const issLowHour = Math.min(...issRates), issHighHour = Math.max(...issRates);
export const issDayLow = Math.round(issLowHour * 24), issDayHigh = Math.round(issHighHour * 24);
export const moonRate = inst['CRaTER'].meanUGyPerH, marsRate = inst['MSL-RAD'].meanUGyPerH;
export const radDay = radlab.day;
export const radUrl = radMeta.sourcePage;

const subject: Record<string, TextKey> = { bone: 'subj_bone', muscle: 'subj_muscle', plants: 'subj_plants' };
const study = (topic: string) => osdr.studies.find((s) => s.topic === topic)!;

export function cardInfo(id: CardId): CardInfo {
  const flare = solarEvent.flares[0], cme = solarEvent.cmes[0];
  const sep = solarEvent.seps.find((s) => s.instrument.startsWith('GOES'))!, gst = solarEvent.gsts[0];
  const mk = (title: TextKey, line: string, source: string, url: string, date: string, kind: 'real' | 'hist' = 'real'): CardInfo => ({ id, title: t(title), line, source, url, date, kind });
  switch (id) {
    case 'donkiFlare': return mk('card_donkiFlare_t', t('card_donkiFlare_l', { cls: flare.classType, date: flare.beginTime.slice(0, 10) }), 'NASA CCMC DONKI', flare.link, flare.beginTime);
    case 'donkiCme': return mk('card_donkiCme_t', t('card_donkiCme_l', { speed: cme.speedKmS ?? '?', date: cme.startTime.slice(0, 10) }), 'NASA CCMC DONKI', cme.link, cme.startTime);
    case 'donkiSep': return mk('card_donkiSep_t', t('card_donkiSep_l', { instrument: sep.instrument, date: sep.eventTime.slice(0, 10) }), 'NASA CCMC DONKI', sep.link, sep.eventTime);
    case 'donkiKp': return mk('card_donkiKp_t', t('card_donkiKp_l', { kp: gst.maxKp }), 'NASA CCMC DONKI', gst.link, gst.startTime);
    case 'radIss': return mk('card_radIss_t', t('card_radIss_l', { lo: issLowHour.toFixed(1), hi: issHighHour.toFixed(1), dlo: issDayLow, dhi: issDayHigh, day: radDay }), 'NASA OSDR RadLab', radUrl, radDay);
    case 'radMoon': return mk('card_radMoon_t', t('card_radMoon_l', { r: moonRate.toFixed(1), day: radDay }), 'NASA OSDR RadLab', radUrl, radDay);
    case 'radMars': return mk('card_radMars_t', t('card_radMars_l', { r: marsRate.toFixed(1), day: radDay }), 'NASA OSDR RadLab', radUrl, radDay);
    case 'osdrBone': case 'osdrMuscle': case 'osdrPlants': {
      const topic = id === 'osdrBone' ? 'bone' : id === 'osdrMuscle' ? 'muscle' : 'plants';
      const s = study(topic);
      return mk(`card_${id}_t` as TextKey, t('card_osdr_l', { title: s.title, id: s.id, subject: t(subject[topic]) }), 'NASA OSDR', s.url, '2026-11-14');
    }
    case 'apollo1972': return mk('card_apollo1972_t', t('card_apollo1972_l', { bfo: apollo.aug1972BloodFormingOrgansRem }), 'Apollo Lunar Surface Journal', 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html', '1972', 'hist');
  }
}

// Research card for a task: the real OSDR study that goes with it.
export function researchFor(task: string): CardId | null {
  if (task === 'exercise') return 'osdrBone';
  if (task === 'medical') return 'osdrMuscle';
  if (task === 'greenhouse') return 'osdrPlants';
  return null;
}
