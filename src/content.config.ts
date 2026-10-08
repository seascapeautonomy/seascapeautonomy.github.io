import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Each trip is a folder: index.md, a cover image and an optional gallery/ of photos.
const fieldwork = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/fieldwork',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      location: z.string(),
      date: z.coerce.date(),
      summary: z.string(),
      sectors: z.array(z.enum(['defence', 'offshore', 'environmental'])),
      cover: image(),
      coverAlt: z.string(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      video: z.string().optional(), // YouTube video id
      partners: z.array(z.object({ name: z.string(), url: z.url().optional() })).default([]),
      stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    }),
});

export const collections = { fieldwork };
