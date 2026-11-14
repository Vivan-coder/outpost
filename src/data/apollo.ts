// Historical context, NOT DONKI data. Used to calibrate the radiation meter and for the "1972 near miss" card.
// Source: Apollo Lunar Surface Journal, "Radiation Environment"
// https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html (read 2026-11-14)
export const apollo = {
  // Dose rate measured outside the Van Allen belts, in lunar orbit and on the surface.
  quietDoseRateMradPerHour: [1, 2] as const,
  // Crew-averaged skin dose over the nine Apollo lunar missions.
  averageMissionSkinDoseRad: 0.46,
  // August 1972 solar particle event, between Apollo 16 and 17. Estimates for an unsheltered crew
  // on the lunar surface, which the ALSJ page cites from NCRP Report No. 98, page 48.
  aug1972SkinDoseRem: 600,
  aug1972BloodFormingOrgansRem: 130,
  sources: [
    'Apollo Lunar Surface Journal, "Radiation Environment"',
    'NASA Science, "How NASA Will Protect Astronauts From Space Radiation at the Moon"',
  ],
};

// Meter calibration: a full radiation bar stands for the 1972 blood-forming-organ estimate.
export const FULL_METER_REM = apollo.aug1972BloodFormingOrgansRem;

// Quiet-day dose per game second, as a share of the meter. Treats 1 rad as roughly 1 rem, which is a
// simplification. The result is tiny on purpose: everyday dose is nothing next to a storm.
export function baselineMeterRate(missionSeconds: number, missionDays: number): number {
  const [lo, hi] = apollo.quietDoseRateMradPerHour;
  const missionRem = (((lo + hi) / 2) * 24 * missionDays) / 1000;
  return ((missionRem / FULL_METER_REM) * 100) / missionSeconds;
}
