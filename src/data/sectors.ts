// Copy for each customer sector; fieldwork is tagged with sectors in src/content/fieldwork.
// First draft assembled from the previous site's
// services, products and fieldwork text; lines marked TODO need real input.
import type { ImageMetadata } from 'astro';
import defenceImage from '../assets/sectors/defence.png';
import offshoreImage from '../assets/sectors/offshore.jpg';
import environmentalImage from '../assets/hero.png';

export interface Offering {
  title: string;
  description: string;
  product?: string; // id of a page under src/content/products
}

export interface Sector {
  slug: string;
  name: string;
  image: ImageMetadata;
  imageAlt: string;
  imagePosition?: string; // CSS object-position for cropped views, e.g. '30% 50%'
  tagline: string;
  summary: string;
  challenge: string;
  offerings: Offering[];
  applications: string[];
  cta: string;
}

export const sectors: Sector[] = [
  {
    slug: 'defence',
    name: 'Defence & Security',
    // TODO: replace with defence-specific imagery (trials or harbour work) if releasable.
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
        product: 'seeker-auv',
        description:
          'Two-person portable and highly manoeuvrable: holds position, dives vertically and works in constrained spaces around man-made structures and behind breaking waves.',
      },
      {
        title: 'Open payload architecture',
        product: 'bespoke-vehicles',
        description:
          'Open hardware and software make it fast to integrate optical, hyperspectral, sonar or water-column sensors for new mission profiles.',
      },
      {
        title: 'Bespoke vehicle design',
        product: 'bespoke-vehicles',
        description:
          'A modular frame that can be extended for additional payload or battery capacity, tailored to your requirements.',
      },
    ],
    // TODO: confirm which of these you want to claim publicly.
    applications: ['Harbour and port infrastructure survey', 'Littoral seabed survey', 'Anomaly detection', 'Sensor and payload trials'],
    cta: 'Discuss a defence requirement',
  },
  {
    slug: 'offshore',
    name: 'Offshore Infrastructure',
    image: offshoreImage,
    imageAlt: 'Two Seeker AUVs on the back deck of a survey vessel at sunrise',
    tagline: 'Inspect, assess and monitor offshore assets with confidence.',
    summary:
      'High-resolution, geo-referenced seafloor imagery around critical marine infrastructure — from offshore environmental impact assessment to cable and pipeline inspection.',
    challenge:
      'Offshore developments need defensible environmental baselines and repeatable inspection data, collected efficiently from a single vessel and delivered in a form stakeholders can use.',
    offerings: [
      {
        title: 'Multi-AUV survey',
        product: 'seeker-auv',
        description:
          'Concurrent deployment of multiple Seeker AUVs multiplies coverage per day at sea, capturing low-altitude imagery over complex terrain.',
      },
      {
        title: 'Stereo imaging systems',
        product: 'stereo-imaging',
        description:
          'Synchronised stereo cameras with integrated lighting for detailed 3D imaging of pipelines, cables and submerged structures.',
      },
      {
        title: 'Seafloor 3D models',
        product: 'seafloor-models',
        description: 'Workflows that turn survey imagery into detailed, landscape-scale 3D models of the seafloor and assets.',
      },
      {
        title: 'Data delivery with SQUIDLE+',
        product: 'squidle',
        description:
          'Imagery delivered into SQUIDLE+ for map-based exploration, human and machine-learning annotation, QA/QC and reporting.',
      },
    ],
    applications: [
      'Offshore environmental impact assessment',
      'Cable and pipeline inspection',
      'Maintenance and change monitoring',
    ],
    cta: 'Plan an offshore survey',
  },
  {
    slug: 'environmental',
    name: 'Environmental Survey',
    image: environmentalImage,
    imageAlt: 'Seeker AUV surveying a reef in Tonga',
    imagePosition: '28% 50%', // keep the AUV in frame in the square crop
    tagline: 'Seafloor imagery that scientists and managers can act on.',
    summary:
      'Benthic imaging at scale for habitat mapping, long-term monitoring and fisheries — from shallow reefs to mesophotic depths.',
    challenge:
      'The need for large-scale benthic survey is rapidly outpacing the capacity of conventional methods. Diver surveys are limited in depth, time and coverage. Traditional ship-based approaches can’t deliver consistent, high-resolution imagery over complex terrain, and are tied to a single instrument, so they can’t scale.',
    offerings: [
      {
        title: 'Benthic imaging AUVs',
        product: 'seeker-auv',
        description:
          'Seeker AUVs capture low-altitude, geo-referenced imagery over rugged reef terrain, covering kilometres of transect per dive.',
      },
      {
        title: 'Seafloor 3D models',
        product: 'seafloor-models',
        description: 'Detailed photogrammetric models of reefs and habitats, such as a 7,800 m² model of seafloor surveyed in Tonga.',
      },
      {
        title: 'Annotation and analysis with SQUIDLE+',
        product: 'squidle',
        description:
          'Discover, annotate and share imagery with collaborators, with integrated machine-learning annotation and QA/QC tools.',
      },
    ],
    applications: [
      'Benthic habitat mapping',
      'Reef survey and long-term monitoring',
      'Fisheries and stock assessment surveys',
    ],
    cta: 'Talk about your survey',
  },
];
