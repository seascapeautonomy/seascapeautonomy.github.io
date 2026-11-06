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

export interface CaseStudy {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  stats: { value: string; label: string }[];
  /** The interactive demo: a folder in src/assets/surveys and the viewer that shows it. */
  demo:
    | { viewer: 'target-search'; survey: string } // built by scripts/build-target-search.py
    | { viewer: 'survey-replay'; survey: string } // built by scripts/build-survey.mjs
    | { viewer: 'fleet-replay'; survey: string }; // built by scripts/build-fleet-replay.py
  note?: string;
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
  caseStudy?: CaseStudy;
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
    applications: [
      'Harbour and port infrastructure survey',
      'Littoral seabed survey',
      'Anomaly detection',
      'Wreck and debris search',
      'Sensor and payload trials',
    ],
    caseStudy: {
      eyebrow: 'Case study · Search to identification',
      title: 'From sonar contact to confirmed aircraft wreck',
      paragraphs: [
        'Working with the Defense POW/MIA Accounting Agency (DPAA) in Hawaii, we paired two Seeker AUVs to find and verify an aircraft wreck site. A sidescan-equipped Seeker swept the search area and picked out a single contact on an otherwise featureless sandy seabed.',
        'A second Seeker carrying our imaging payload then flew low over the contact, building a photomosaic at millimetre-scale resolution and a 3D model of the site. Detail invisible to sonar, such as the airframe structure and a propeller lying clear of the wreckage, confirmed the contact as an aircraft wreck.',
      ],
      stats: [
        { value: '12 ha', label: 'searched with sidescan sonar' },
        { value: '3,000 m²', label: 'imaged over the contact' },
        { value: '0.6 mm', label: 'native imaging resolution' },
      ],
      demo: { viewer: 'target-search', survey: 'wreck-search' },
    },
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
    caseStudy: {
      eyebrow: 'Case study · Coordinated multi-AUV survey',
      title: 'Two Seekers, one buoy, one vessel',
      paragraphs: [
        'For an environmental impact assessment ahead of an offshore wind development in Bass Strait, we worked with Fathom Pacific and ERM to image the seafloor across the proposed site. Running two Seekers at once, with the Bob surface buoy relaying between the vehicles and the operators, the team completed 75 dives in three weeks at sea.',
        'This replay is real data from one of those dives: both Seekers flying their missions at 54 m while Bob tracks them acoustically from the surface. The seafloor is reconstructed from the vehicles’ own depth and altimeter readings.',
      ],
      stats: [
        { value: '2', label: 'Seekers surveying at once' },
        { value: '54 m', label: 'working depth' },
        { value: '75', label: 'dives in three weeks at sea' },
      ],
      demo: { viewer: 'fleet-replay', survey: 'coordinated-survey' },
    },
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
      'The need for large-scale benthic survey is rapidly outpacing the capacity of conventional methods. Diver surveys are limited in depth, time and coverage. Traditional ship-based approaches fail to deliver consistent, high-resolution imagery over complex terrain, and are tied to a single instrument, which limits their scalability.',
    offerings: [
      {
        title: 'Benthic imaging AUVs',
        product: 'seeker-auv',
        description:
          'Seeker AUVs capture low-altitude, geo-referenced imagery over rugged reef terrain, covering kilometres of transect per dive.',
      },
      {
        title: 'Scalable multi-AUV survey',
        product: 'fleet-coordination',
        description:
          'A surface buoy or ASV relays communications to coordinate and monitor several Seekers at once, decoupling the ship from AUV operations so coverage scales with the fleet, not with ship time.',
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
    caseStudy: {
      eyebrow: 'Case study · Mesophotic reef mapping',
      title: 'Two Seekers, one 3D model of a volcanic reef',
      paragraphs: [
        'In Tonga, we deployed two Seeker AUVs alongside divers to document mesophotic reefs on rugged volcanic islands, with support from the Inkfish Foundation. The vehicles flew in coordination, following the steep, boulder-strewn terrain at low altitude to image areas beyond comfortable diving depths.',
        'Imagery from multiple overlapping dives was stitched into a single photogrammetric 3D model of the reef. Replay the dives below: the highlighted patch is what the camera sees, and finer detail streams in as you zoom.',
      ],
      stats: [
        { value: '2', label: 'Seeker AUVs flying in coordination' },
        { value: '9', label: 'dives replayed over the model' },
        { value: '3.5 h', label: 'of recorded flight' },
      ],
      demo: { viewer: 'survey-replay', survey: 'tonga-2024' },
    },
    cta: 'Talk about your survey',
  },
];
