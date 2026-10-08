import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';

export type Fieldwork = CollectionEntry<'fieldwork'>;

/** All fieldwork, newest first. */
export async function getFieldwork(): Promise<Fieldwork[]> {
  const entries = await getCollection('fieldwork');
  return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const galleryImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/fieldwork/*/gallery/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG}',
  { eager: true },
);

/** Photos in a trip's gallery/ folder, in filename order. */
export function getGallery(id: string): ImageMetadata[] {
  const prefix = `/src/content/fieldwork/${id}/gallery/`;
  return Object.entries(galleryImages)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, module]) => module.default);
}
