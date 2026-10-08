import type { ImageMetadata } from 'astro';
import williams from '../assets/team/headshotSWilliams.jpg';
import toohey from '../assets/team/headshotLToohey.jpg';
import shields from '../assets/team/headshotJShields.jpg';
import billings from '../assets/team/headshotGBillings.jpg';
import henderson from '../assets/team/headshotDHenderson.jpg';

export interface Person {
  name: string;
  role: string;
  photo: ImageMetadata;
  linkedin: string;
}

// Carried over from the old site's team section.
export const team: Person[] = [
  { name: 'Stefan B. Williams', role: 'Director', photo: williams, linkedin: 'https://linkedin.com/in/stefan-williams-88216b23/' },
  { name: 'Lachlan Toohey', role: 'Lead Software Engineering', photo: toohey, linkedin: 'https://linkedin.com/in/lachlantoohey/' },
  { name: 'Jackson Shields', role: 'Lead Systems Engineering', photo: shields, linkedin: 'https://linkedin.com/in/jackson-shields-819314103/' },
  { name: 'Gideon Billings', role: 'Lead Perception', photo: billings, linkedin: 'https://linkedin.com/in/gideonbillings/' },
  { name: 'David Henderson', role: 'Lead Mechanical Engineering', photo: henderson, linkedin: 'https://linkedin.com/in/davidhendersoneng/' },
];
