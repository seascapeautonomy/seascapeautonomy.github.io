import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const sectorSlug = z.enum(['defence', 'offshore', 'environmental']);

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
      sectors: z.array(sectorSlug),
      cover: image(),
      coverAlt: z.string(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      video: z.string().optional(), // YouTube video id
      partners: z.array(z.object({ name: z.string(), url: z.url().optional() })).default([]),
      stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    }),
});

// Each product is a folder: index.md (frontmatter plus long description) and a cover image.
const products = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/products',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      kind: z.string(), // e.g. Platform, Payload, Data & software
      order: z.number(),
      tagline: z.string(),
      summary: z.string(),
      cover: image(),
      coverAlt: z.string(),
      sectors: z.array(sectorSlug),
      highlights: z.array(z.object({ title: z.string(), text: z.string() })).default([]),
      specs: z
        .array(z.object({ group: z.string(), items: z.array(z.object({ label: z.string(), value: z.string() })) }))
        .default([]),
      videos: z.array(z.string()).default([]), // YouTube video ids
    }),
});

export const collections = { fieldwork, products };
