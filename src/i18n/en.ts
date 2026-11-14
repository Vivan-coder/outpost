// All player-facing text lives here so the Arabic file can mirror it key for key.
export const en = {
  title: 'Outpost',
  power: 'Power',
  air: 'Oxygen + Water',
  food: 'Food',
  radiation: 'Radiation',
  hintDesktop: 'Click to look · WASD to walk · Space to jump',
  hintTouch: 'Left thumb: walk · Right thumb: look',
  jump: 'JUMP',
} as const;

export type TextKey = keyof typeof en;

let current: Record<TextKey, string> = en;
export const t = (key: TextKey): string => current[key];
export const setLanguage = (table: Record<TextKey, string>): void => { current = table; };
