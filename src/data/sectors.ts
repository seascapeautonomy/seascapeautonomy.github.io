// Copy for each customer sector. First draft assembled from the previous site's
// services, products and fieldwork text; lines marked TODO need real input.
import type { ImageMetadata } from 'astro';
import defenceImage from '../assets/sectors/defence.png';
import offshoreImage from '../assets/sectors/offshore.jpg';
import environmentalImage from '../assets/sectors/environmental.png';

export interface Offering {
  title: string;
  description: string;
}

export interface Proof {
  title: string;
  date: string;
  description: string;
}

export interface Sector {
  slug: string;
  name: string;
  image: ImageMetadata;
  imageAlt: string;
  tagline: string;
  summary: string;
  challenge: string;
  offerings: Offering[];
  applications: string[];
  proof: Proof[];
  cta: string;
}

export const sectors: Sector[] = [
  {
    slug: 'defence',
    name: 'Defence & Security',
    // TODO: replace with defence-specific imagery (trials, harbour or hull work) if releasable.
    image: defenceImage,
    imageAlt: 'Seeker AUV on the surface in shallow water',
    tagline: 'Seabed awareness where larger systems can’t go.',
    summary:
      'Two-person portable, hover-capable AUVs that operate close to the seafloor, around structures and in the shallows — reconfigurable for the sensors your mission needs.',
    challenge:
      'Harbours, approaches and littoral zones are cluttered, shallow and dynamic. Large survey platforms need big vessels and long lead times, and struggle to work close to structures or behind the surf line.',
    offerings: [
      {
        title: 'Seeker AUV',
        description:
          'Two-person portable and highly manoeuvrable: holds position, dives vertically and works in constrained spaces around man-made structures and behind breaking waves.',
      },
      {
        title: 'Open payload architecture',
        description:
          'Open hardware and software make it fast to integrate optical, hyperspectral, sonar or water-column sensors for new mission profiles.',
      },
      {
        title: 'Bespoke vehicle design',
        description:
          'A modular frame that can be extended for additional payload or battery capacity, tailored to your requirements.',
      },
    ],
    // TODO: confirm which of these you want to claim publicly.
    applications: ['Ship hull inspection', 'Harbour and port infrastructure survey', 'Littoral seabed survey', 'Sensor and payload trials'],
    // TODO: add trials or programs you can name publicly.
    proof: [],
    cta: 'Discuss a defence requirement',
  },
  {
    slug: 'offshore',
    name: 'Offshore Infrastructure',
    image: offshoreImage,
    imageAlt: 'Two Seeker AUVs on the back deck of a survey vessel at sunrise',
    tagline: 'Inspect, assess and monitor offshore assets with confidence.',
    summary:
      'High-resolution, geo-referenced seafloor imagery around critical marine infrastructure — from offshore wind environmental impact assessment to cable, pipeline and hull inspection.',
    challenge:
      'Offshore developments need defensible environmental baselines and repeatable inspection data, collected efficiently from a single vessel and delivered in a form stakeholders can use.',
    offerings: [
      {
        title: 'Multi-AUV survey',
        description:
          'Concurrent deployment of multiple Seeker AUVs multiplies coverage per day at sea, capturing low-altitude imagery over complex terrain.',
      },
      {
        title: 'Stereo imaging systems',
        description:
          'Synchronised stereo cameras with integrated lighting for detailed 3D imaging of pipelines, cables and submerged structures.',
      },
      {
        title: 'Seafloor 3D models',
        description: 'Workflows that turn survey imagery into detailed, landscape-scale 3D models of the seafloor and assets.',
      },
      {
        title: 'Data delivery with SQUIDLE+',
        description:
          'Imagery delivered into SQUIDLE+ for map-based exploration, human and machine-learning annotation, QA/QC and reporting.',
      },
    ],
    applications: [
      'Offshore wind environmental impact assessment',
      'Cable and pipeline inspection',
      'Ship hull inspection',
      'Maintenance and change monitoring',
    ],
    proof: [
      {
        title: 'Aurora Green, Bass Strait',
        date: 'March 2026',
        description:
          'Environmental impact assessment for a future offshore wind development with Fathom Pacific and ERM: 75 dives and over 440,000 high-resolution seafloor images in three weeks at sea.',
      },
      {
        title: 'Gippsland, Victoria',
        date: 'February 2025',
        description: 'Multi-AUV surveys alongside Fathom Pacific in proximity to new offshore wind leases.',
      },
    ],
    cta: 'Plan an offshore survey',
  },
  {
    slug: 'environmental',
    name: 'Environmental Survey',
    image: environmentalImage,
    imageAlt: 'View from the nose of a Seeker AUV approaching a reef',
    tagline: 'Seafloor imagery that scientists and managers can act on.',
    summary:
      'Benthic imaging at scale for habitat mapping, long-term monitoring and fisheries — from shallow reefs to mesophotic depths.',
    challenge:
      'Diver surveys are limited in depth, time and coverage, while ship-based methods miss fine detail. Managers need repeatable, high-resolution imagery across whole landscapes.',
    offerings: [
      {
        title: 'Benthic imaging AUVs',
        description:
          'Seeker AUVs capture low-altitude, geo-referenced imagery over rugged reef terrain, covering kilometres of transect per dive.',
      },
      {
        title: 'Seafloor 3D models',
        description: 'Detailed photogrammetric models of reefs and habitats, such as a 7,800 m² model of seafloor surveyed in Tonga.',
      },
      {
        title: 'Annotation and analysis with SQUIDLE+',
        description:
          'Discover, annotate and share imagery with collaborators, with integrated machine-learning annotation and QA/QC tools.',
      },
    ],
    applications: [
      'Benthic habitat mapping',
      'Long-term reef monitoring',
      'Mesophotic reef survey',
      'Fisheries and stock assessment surveys',
    ],
    proof: [
      {
        title: 'Lizard Island, Great Barrier Reef',
        date: 'October 2025',
        description: 'AUV and imaging-ROV surveys supporting a long-term reef monitoring program around the island.',
      },
      {
        title: 'Norfolk & Phillip Islands',
        date: 'May 2025',
        description:
          'Reef surveys at 5–45 m for the Australian Museum-led expedition, each dive covering 1–3 km of transect.',
      },
      {
        title: 'Tonga',
        date: 'October 2024',
        description:
          'Two Seeker AUVs deployed alongside divers to document mesophotic reefs on rugged volcanic islands, supported by the Inkfish Foundation.',
      },
    ],
    cta: 'Talk about your survey',
  },
];
