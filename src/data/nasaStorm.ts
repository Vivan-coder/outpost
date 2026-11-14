// Real space-weather records from NASA's DONKI database (Space Weather Database Of Notifications,
// Knowledge, Information), run by the Community Coordinated Modeling Center at NASA Goddard.
// Fetched 2026-11-14 from https://api.nasa.gov/DONKI/SEP and /GST for 2024-05-08 .. 2024-05-15.
// Fields below are copied from the records; nothing here is invented.

export interface NasaRecord {
  id: string; // DONKI activity id
  kind: 'SEP' | 'GST';
  timeUtc: string;
  instrument: string;
  url: string;
}

export const nasaRecords: Record<string, NasaRecord> = {
  sepMay10: {
    id: '2024-05-10T13:35:00-SEP-001',
    kind: 'SEP',
    timeUtc: '2024-05-10T13:35Z',
    instrument: 'GOES-P: SEISS >10 MeV',
    url: 'https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/30677/-1',
  },
  sepMay11: {
    id: '2024-05-11T02:10:00-SEP-001',
    kind: 'SEP',
    timeUtc: '2024-05-11T02:10Z',
    instrument: 'GOES-P: SEISS >100 MeV',
    url: 'https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/30714/-1',
  },
  // Geomagnetic storm at Earth over the same days; its Kp index peaked at 9. Used in the info card only.
  gstMay10: {
    id: '2024-05-10T15:00:00-GST-001',
    kind: 'GST',
    timeUtc: '2024-05-10T15:00Z',
    instrument: 'NOAA Kp index, peak 9',
    url: 'https://ccmc.gsfc.nasa.gov/DONKI/view/GST/30693/-1',
  },
};

export const NASA_SOURCE = 'NASA DONKI (CCMC, NASA Goddard)';
