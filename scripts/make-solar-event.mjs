// One-off: trims raw DONKI downloads to the records of one event and writes the bundled JSON.
// Usage: node scripts/make-solar-event.mjs <dir with FLR.json SEP.json CME.json GST.json>
// Raw files come from https://ccmc.gsfc.nasa.gov/DONKI/WS/get/{FLR,SEP,CME,GST}?startDate=2024-05-08&endDate=2024-05-12
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Usage: node scripts/make-solar-event.mjs <dir> [slug] [startDate] [endDate] [flareId,flareId] [name]
const dir = process.argv[2];
const slug = process.argv[3] ?? '';
const START = process.argv[4] ?? '2024-05-08', END = process.argv[5] ?? '2024-05-12';
const NAME = process.argv[7] ?? 'May 2024 solar storm';
const load = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const ids = (e) => (e.linkedEvents ?? []).map((l) => l.activityID);

const FLARE_IDS = (process.argv[6] ?? '2024-05-10T06:27:00-FLR-001,2024-05-11T01:10:00-FLR-001').split(',');

const flares = load('FLR').filter((f) => FLARE_IDS.includes(f.flrID)).map((f) => ({
  id: f.flrID, beginTime: f.beginTime, peakTime: f.peakTime, endTime: f.endTime, classType: f.classType,
  sourceLocation: f.sourceLocation, activeRegionNum: f.activeRegionNum,
  instrument: f.instruments.map((i) => i.displayName).join('; '), link: f.link, linkedEvents: ids(f),
}));
const linked = new Set(flares.flatMap((f) => f.linkedEvents));

const cmes = load('CME').filter((c) => linked.has(c.activityID)).map((c) => {
  const a = (c.cmeAnalyses ?? []).find((x) => x.isMostAccurate) ?? {};
  return { id: c.activityID, startTime: c.startTime, speedKmS: a.speed ?? null, type: a.type ?? null, halfAngleDeg: a.halfAngle ?? null, link: c.link, linkedEvents: ids(c) };
});

const seps = load('SEP').filter((s) => linked.has(s.sepID)).map((s) => ({
  id: s.sepID, eventTime: s.eventTime, instrument: s.instruments.map((i) => i.displayName).join('; '), link: s.link, linkedEvents: ids(s),
}));

const gsts = load('GST').map((g) => ({
  id: g.gstID, startTime: g.startTime, maxKp: Math.max(...g.allKpIndex.map((k) => k.kpIndex)),
  kp: g.allKpIndex.map((k) => ({ time: k.observedTime, kp: k.kpIndex, source: k.source })), link: g.link, linkedEvents: ids(g),
}));

const event = { name: NAME, activeRegionNum: flares[0]?.activeRegionNum ?? 0, flares, cmes, seps, gsts };
const SUFFIX = slug ? `-${slug}` : '';
writeFileSync(`src/data/solar-event${SUFFIX}.json`, JSON.stringify(event, null, 2) + '\n');

const meta = {
  source: 'NASA CCMC DONKI (Space Weather Database Of Notifications, Knowledge, Information)',
  sourcePage: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  apiBase: 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get/',
  endpoints: ['FLR', 'SEP', 'CME', 'GST'],
  query: { startDate: START, endDate: END },
  downloadDate: '2026-11-14',
  apiKeyUsed: false,
  eventIds: { flares: flares.map((f) => f.id), cmes: cmes.map((c) => c.id), seps: seps.map((s) => s.id), gsts: gsts.map((g) => g.id) },
  quality: 'DONKI states its real-time information should be considered prototyping quality and in research context.',
  note: 'Trimmed copies of the DONKI records. Field values are unchanged; some fields are dropped and CME speed, type and half angle come from the analysis flagged isMostAccurate.',
};
writeFileSync(`src/data/solar-event${SUFFIX}.meta.json`, JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta.eventIds, null, 1));
