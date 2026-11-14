import type { TextKey } from '../i18n/en';

// Hands-on task definitions. A task is a list of steps; the work engine in game/work.ts runs them.
// These are simplified versions of real station work, made for ages 7-12.
export type Tool = 'screwdriver' | 'wrench' | 'multimeter' | 'spare' | 'brush' | 'can' | 'seeds' | 'shears';
export type StepKind =
  | 'pickTool' | 'unscrew' | 'removePart' | 'inspect' | 'insertPart' | 'connectCable' | 'fasten' | 'close' | 'flip'
  | 'wipe' | 'unlock' | 'lock' | 'hold' | 'test' | 'plant' | 'water' | 'harvest' | 'lamp';
export interface Step { kind: StepKind; tool?: Tool; n?: number; target?: string; hint: TextKey }
export type WorkKind = 'repair' | 'solar' | 'water' | 'greenhouse';

export const TOOLS: { id: Tool; icon: string }[] = [
  { id: 'screwdriver', icon: '🪛' },
  { id: 'wrench', icon: '🔧' },
  { id: 'multimeter', icon: '📟' },
  { id: 'spare', icon: '📦' },
  { id: 'brush', icon: '🧹' },
  { id: 'can', icon: '🚿' },
  { id: 'seeds', icon: '🌱' },
  { id: 'shears', icon: '✂️' },
];

const pick = (tool: Tool): Step => ({ kind: 'pickTool', tool, hint: 'ws_pick' });

// Power panel repair: open it up, find the burnt module with the meter, swap it, reconnect, close, test.
// Which module is burnt (one or two of them) is random every time.
export const REPAIR_STEPS: Step[] = [
  pick('screwdriver'),
  { kind: 'unscrew', tool: 'screwdriver', n: 4, target: 'screw', hint: 'ws_unscrew' },
  { kind: 'removePart', target: 'cover', hint: 'ws_cover' },
  pick('multimeter'),
  { kind: 'inspect', tool: 'multimeter', target: 'mod', hint: 'ws_inspect' },
  { kind: 'removePart', target: 'burnt', hint: 'ws_remove' },
  pick('spare'),
  { kind: 'insertPart', tool: 'spare', target: 'slot', hint: 'ws_insert' },
  { kind: 'connectCable', n: 3, hint: 'ws_cables' },
  { kind: 'close', target: 'cover', hint: 'ws_close' },
  pick('screwdriver'),
  { kind: 'fasten', tool: 'screwdriver', n: 4, target: 'screw', hint: 'ws_fasten' },
  { kind: 'flip', target: 'breaker', hint: 'ws_breaker' },
];

// Solar array cleaning: brush the dust off every panel and watch the power output rise.
export const SOLAR_STEPS: Step[] = [
  pick('brush'),
  { kind: 'wipe', tool: 'brush', hint: 'ws_wipe' },
  { kind: 'test', target: 'inverter', hint: 'ws_testSolar' },
];

// Water recovery filter swap: unlock, pull the dirty cartridge, slide in a clean one, lock, prime, test.
export const WATER_STEPS: Step[] = [
  pick('wrench'),
  { kind: 'unlock', tool: 'wrench', target: 'lever', hint: 'ws_unlock' },
  { kind: 'removePart', target: 'cart', hint: 'ws_cartOut' },
  pick('spare'),
  { kind: 'insertPart', tool: 'spare', target: 'tray', hint: 'ws_cartIn' },
  pick('wrench'),
  { kind: 'lock', tool: 'wrench', target: 'lever', hint: 'ws_lock' },
  { kind: 'hold', target: 'pump', hint: 'ws_prime' },
  { kind: 'test', target: 'quality', hint: 'ws_quality' },
];

// Greenhouse: the steps depend on what the plants need right now (empty pots, dry soil, ripe plants, dead lamp).
export function greenhouseSteps(plants: { stage: number; water: number }[], lampOn: boolean): Step[] {
  const out: Step[] = [];
  const add = (tool: Tool, s: Step) => {
    const last = [...out].reverse().find((x) => x.kind === 'pickTool');
    if (!last || last.tool !== tool || out[out.length - 1].kind === 'lamp') out.push(pick(tool));
    out.push(s);
  };
  if (!lampOn) out.push({ kind: 'lamp', target: 'lamp', hint: 'ws_lamp' });
  plants.forEach((p, i) => { if (p.stage === 0) add('seeds', { kind: 'plant', tool: 'seeds', target: `pot${i}`, hint: 'ws_plant' }); });
  plants.forEach((p, i) => { if (p.stage > 0 && p.stage < 4 && p.water < 0.35) add('can', { kind: 'water', tool: 'can', target: `pot${i}`, hint: 'ws_water' }); });
  plants.forEach((p, i) => { if (p.stage === 4) add('shears', { kind: 'harvest', tool: 'shears', target: `pot${i}`, hint: 'ws_harvest' }); });
  if (out.length === 0) out.push({ kind: 'test', target: 'lamp', hint: 'ws_lamp' });
  return out;
}
