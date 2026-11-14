// All player-facing text lives here so an Arabic table can mirror it key for key.
export const en = {
  title: 'Outpost',
  power: 'Power',
  air: 'Oxygen + Water',
  food: 'Food',
  radiation: 'Radiation',
  parts: 'Parts',
  sol: 'Sol {n}',
  timeLeft: '{t} to rescue ship',
  hintDesktop: 'Click to look · WASD walk · E fix · B build · C crew · H shelter',
  hintTouch: 'Left thumb: walk · Right thumb: look',

  btnJump: 'JUMP',
  btnFix: 'FIX',
  btnBuild: 'BUILD',
  btnCrew: 'CREW',
  btnPlace: 'PLACE HERE',
  btnCancel: 'CANCEL',
  btnClose: 'Close',
  btnShelter: 'CALL CREW TO SHELTER',
  btnAllClear: 'ALL CLEAR: BACK TO WORK',
  btnStart: 'Start mission',
  btnGotIt: 'Got it',
  btnAgain: 'Play again',

  mod_habitat: 'Habitat',
  mod_solar: 'Solar panel',
  mod_battery: 'Battery',
  mod_lifeSupport: 'Life support',
  mod_tank: 'Storage tank',
  mod_greenhouse: 'Greenhouse',
  modInfo_habitat: 'Shelter from radiation',
  modInfo_solar: 'Makes power from sunlight',
  modInfo_battery: 'Stores 50 more power',
  modInfo_lifeSupport: 'Turns power into oxygen and water',
  modInfo_tank: 'Stores 50 more oxygen and water',
  modInfo_greenhouse: 'Grows food, uses power and water',

  buildTitle: 'Build a module',
  buildCost: '{n} parts',
  buildNoParts: 'Not enough parts. Send someone to count moon rocks.',
  placeHint: 'Look where you want it. Green means it fits.',
  placeBad: 'It does not fit there. Find open, flat ground near the base.',
  built: '{name} built.',
  fixed: '{name} fixed.',

  crewTitle: 'Give the crew a chore',
  chore_tomatoes: 'Water the tomatoes',
  chore_panels: 'Polish the solar panels',
  chore_filters: 'Sniff-test the air filters',
  chore_rocks: 'Count moon rocks',
  choreGain_tomatoes: '+ food',
  choreGain_panels: '+ power',
  choreGain_filters: '+ oxygen and water',
  choreGain_rocks: '+ parts',
  choreRest: 'Take a break',
  crewIdle: 'resting',
  crewWalking: 'on the way',
  crewSheltered: 'in the habitat',
  crewWaiting: 'waiting: it is broken',
  crewNoModule: '{name} has nowhere to do that. Build one first.',
  assigned: '{name}: {chore}',

  broke_failure: '{name} broke down. Walk to it and press FIX.',
  broke_wear: '{name} wore out. Walk to it and press FIX.',
  broke_meteor: 'A meteor hit the {name}.',
  broke_surge: 'The storm knocked out a {name}.',
  partFound: 'Moon rocks counted: +1 part.',
  meteorBanner: 'METEOR SHOWER (game event)',

  stormWarn: 'SOLAR STORM in {s} s. Get everyone inside.',
  stormActive: 'SOLAR STORM. Stay in the habitat. {s} s left.',
  stormSource: 'Real event: {date} UTC · {instrument} · Source: {source}',
  stormOver: 'The storm has passed. Send the crew back to work.',
  exposed: 'You are outside in the storm!',
  safe: 'You are sheltered.',

  tutorialTitle: 'Welcome to Outpost',
  tutorialBody:
    'You run a Moon base with three crew: Zaid, Mariam and Sam. A rescue ship arrives in 5 minutes. Keep everyone alive until then.',
  tut1: 'Watch the four bars. If oxygen, water or food runs out, the mission ends.',
  tut2: 'When a module breaks, a red ! appears. Walk to it and press FIX.',
  tut3: 'Press CREW to give out chores. Chores top up your supplies.',
  tut4: 'Press BUILD to add modules. Building costs parts.',
  tut5: 'When a solar storm is coming, call the crew to shelter and stand next to the habitat yourself.',

  infoTitle: 'That storm really happened',
  infoBody1:
    'On {date} UTC, the GOES satellite measured a burst of fast protons from the Sun. NASA logged it as a Solar Energetic Particle event.',
  infoBody2:
    'On Earth, the air and the magnetic field stop most of these particles. The Moon has neither, so astronauts have to get behind thick shielding.',
  infoBody3:
    'During the same days, Earth had a geomagnetic storm that reached Kp 9, the top of the scale.',
  infoBody4: 'In the game the storm is squeezed into seconds and the dose numbers are simplified.',
  infoSource: 'Source: {source}, record {id}',

  winTitle: 'Rescue ship has landed!',
  winBody: 'Everyone made it. Rank: {rank}',
  rank1: 'Junior Astronaut',
  rank2: 'Mission Specialist',
  rank3: 'Base Commander',
  loseTitle: 'Mission failed',
  lose_air: 'The base ran out of oxygen and water.',
  lose_food: 'The base ran out of food.',
  lose_radiation: 'The crew took too much radiation.',
  why_airBroken: 'Life support was not working for {s} seconds. Fix it as soon as the red ! appears.',
  why_airPower: 'The power ran out for {s} seconds, so life support switched off. Build solar panels and a battery before the storm.',
  why_airUse: 'The crew used oxygen and water faster than the base made them. Build a second life support or give someone the air filter chore.',
  why_foodBroken: 'The greenhouse was not working for {s} seconds. Fix it quickly next time.',
  why_foodUse: 'One greenhouse is not enough for four people. Send someone to water the tomatoes, or build a second greenhouse.',
  why_radiation: 'People were outside for about {s} seconds of solar storm. Call the crew to shelter during the warning and stand next to the habitat.',
  reportTitle: 'Mission report',
  reportStats: 'Survived {t} · {fixes} fixes · {builds} modules built',
  creditsLine: 'Storm data: NASA DONKI. Game events, sounds and art are original. Built with Three.js.',
} as const;

export type TextKey = keyof typeof en;

let current: Record<TextKey, string> = en;
export function t(key: TextKey, vars?: Record<string, string | number>): string {
  let s = current[key];
  if (vars) for (const k in vars) s = s.replace(`{${k}}`, String(vars[k]));
  return s;
}
export const setLanguage = (table: Record<TextKey, string>): void => { current = table; };
