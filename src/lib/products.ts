import { getCollection, type CollectionEntry } from 'astro:content';
import type { Variant } from '../components/ModelViewer.astro';

export type Product = CollectionEntry<'products'>;

/** All products in display order. */
export async function getProducts(): Promise<Product[]> {
  const entries = await getCollection('products');
  return entries.sort((a, b) => a.data.order - b.data.order);
}

const modelUrls = import.meta.glob<string>('/src/content/products/*/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** The product's 3D models as viewer variants; a listed file that doesn't exist yet shows as "coming soon". */
export function getModelVariants(product: Product): Variant[] {
  return product.data.models.map((model) => ({
    label: model.label ?? product.data.title,
    description: model.description ?? product.data.title,
    src: modelUrls[`/src/content/products/${product.id}/${model.file}`],
  }));
}
