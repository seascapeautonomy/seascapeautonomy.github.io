// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://seascapeautonomy.com',
  vite: {
    // Pre-bundle Leaflet at dev-server start; discovering it lazily can leave
    // the browser requesting a stale bundle ("504 Outdated Optimize Dep").
    optimizeDeps: { include: ['leaflet'] },
  },
});
