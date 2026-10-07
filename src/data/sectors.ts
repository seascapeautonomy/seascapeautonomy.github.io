// Placeholder copy for each customer sector — replace with real messaging.
export interface Sector {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  capabilities: string[];
}

export const sectors: Sector[] = [
  {
    slug: 'defence',
    name: 'Defence',
    tagline: 'Persistent, covert seafloor awareness.',
    summary: 'Autonomous survey and seabed change detection for maritime security and mine countermeasures.',
    capabilities: ['Seabed change detection', 'Route survey', 'Sovereign data handling'],
  },
  {
    slug: 'offshore',
    name: 'Offshore Infrastructure',
    tagline: 'Inspect and monitor assets without the crewed vessel.',
    summary: 'Repeatable, high-resolution inspection of cables, pipelines, foundations and offshore wind sites.',
    capabilities: ['Asset inspection', 'Scour and change monitoring', 'Pre-lay and as-built survey'],
  },
  {
    slug: 'environmental',
    name: 'Environmental Survey',
    tagline: 'Seafloor imagery that stakeholders can act on.',
    summary: 'Benthic habitat mapping and long-term monitoring for marine parks, research and impact assessment.',
    capabilities: ['Benthic habitat mapping', 'Photogrammetric seafloor models', 'Long-term monitoring'],
  },
];
