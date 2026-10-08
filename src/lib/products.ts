import { getCollection, type CollectionEntry } from 'astro:content';

export type Product = CollectionEntry<'products'>;

/** All products in display order. */
export async function getProducts(): Promise<Product[]> {
  const entries = await getCollection('products');
  return entries.sort((a, b) => a.data.order - b.data.order);
}
