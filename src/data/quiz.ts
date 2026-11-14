import type { StormInfo } from '../sim/sim.ts';
import type { TextKey } from '../i18n/en';
import { apollo } from './apollo.ts';

// Storm quiz: every right answer is a value from the bundled NASA records. Wrong options are plausible
// but made up, and are never shown as facts.
export interface Question { id: string; key: TextKey; options: string[]; correct: number }

// Puts the right answer at a different position for each question so it is not always first.
function arrange(id: string, key: TextKey, right: string, wrong: string[], slot: number): Question {
  const options = [...wrong];
  const at = slot % (wrong.length + 1);
  options.splice(at, 0, right);
  return { id, key, options, correct: at };
}

export function makeQuiz(info: StormInfo): Question[] {
  const num = info.flareClass.slice(1);
  const speed = info.cmeSpeedKmS ?? 1000;
  const probe = info.sepInstrument.split(':')[0];
  const others = ['GOES-P', 'SOHO', 'STEREO A'].filter((p) => p !== probe).slice(0, 2);
  const bfo = apollo.aug1972BloodFormingOrgansRem;
  return [
    arrange('flare', 'quiz_flare', info.flareClass, [`M${num}`, `C${num}`], 1),
    arrange('cme', 'quiz_cme', `${speed} km/s`, [`${Math.round(speed / 2)} km/s`, `${Math.round(speed * 2)} km/s`], 2),
    arrange('instr', 'quiz_instr', probe, others, 0),
    arrange('apollo', 'quiz_apollo', `${bfo} rem`, [`${Math.round(bfo / 10)} rem`, `${bfo * 10} rem`], 1),
  ];
}
