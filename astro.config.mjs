// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://seascapeautonomy.com',
  server: {
    // Let the dev/preview server answer requests through a Cloudflare quick tunnel
    // (scripts/share.sh); other unknown hostnames are still rejected.
    allowedHosts: ['.trycloudflare.com'],
  },
  vite: {
    // Pre-bundle large client libraries at dev-server start; discovering them lazily can leave
    // the browser requesting a stale bundle ("504 Outdated Optimize Dep").
    optimizeDeps: { include: ['leaflet', '@google/model-viewer'] },
  },
});
