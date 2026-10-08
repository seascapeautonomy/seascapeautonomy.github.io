// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://seascapeautonomy.com',
  vite: {
    // Pre-bundle large client libraries at dev-server start; discovering them lazily can leave
    // the browser requesting a stale bundle ("504 Outdated Optimize Dep").
    optimizeDeps: { include: ['leaflet', '@google/model-viewer'] },
  },
});
