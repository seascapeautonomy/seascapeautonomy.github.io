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
      coverPosition: z.string().optional(), // CSS object-position for cropped views, e.g. '15% 50%'
      sectors: z.array(sectorSlug),
      highlights: z.array(z.object({ title: z.string(), text: z.string() })).default([]),
      specs: z
        .array(z.object({ group: z.string(), items: z.array(z.object({ label: z.string(), value: z.string() })) }))
        .default([]),
      videos: z.array(z.string()).default([]), // YouTube video ids
      // .glb files in the product's folder, shown in a 3D viewer instead of the cover photo.
      // More than one adds a button per model; the first one available is shown by default.
      models: z
        .array(z.object({ file: z.string(), label: z.string().optional(), description: z.string().optional() }))
        .default([]),
      modelCameraOrbit: z.string().optional(),
      modelFieldOfView: z.string().optional(),
    }),
});

// Legal documents, each served at /<file name> (the same URLs as the old site).
const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
  }),
});

export const collections = { fieldwork, products, legal };
