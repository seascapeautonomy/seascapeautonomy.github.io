# Seascape Autonomy website

The source for [seascapeautonomy.com](https://seascapeautonomy.com), built with [Astro](https://astro.build) and hosted on GitHub Pages.

## Working on the site

Requires Node.js 22.12 or newer.

```sh
npm install        # once, and after dependencies change
npm run dev        # live preview at http://localhost:4321 (add -- --host to open it from your phone)
npm run build      # build the production site into dist/
npm run preview    # serve dist/ to check the production build
```

The dev server keeps running in the background; stop it with `npx astro dev stop`.

### Sharing a preview with the team

`npm run share` builds the site and serves it through a temporary public link
(`https://…trycloudflare.com`, via a Cloudflare quick tunnel). It needs
[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
installed. The link lasts while the command runs, changes each time, and anyone with it can view
the site. Press Ctrl+C to stop sharing. Add `-- --no-build` to reuse the last build, or set
`PORT=4401` if port 4400 is busy.

Pushing to `master` builds and deploys the site (`.github/workflows/deploy.yml`). Other branches never deploy, so work on a branch and preview locally until it's ready.

## Where things live

| To change… | Edit |
| --- | --- |
| Colours, fonts and spacing | `src/styles/global.css` (tokens at the top) |
| Home page hero and vehicle specs | `src/components/Hero.astro`, `vehicleStats` in `src/data/company.ts` |
| Company values, contact details, form endpoint | `src/data/company.ts` |
| Sector pages (defence, offshore, environmental) | `src/data/sectors.ts` |
| Team | `src/data/team.ts` and photos in `src/assets/team/` |
| Products | `src/content/products/<product>/` |
| Fieldwork | `src/content/fieldwork/<trip>/` |
| Legal documents | `src/content/legal/<document>.md` (served at `/<document>`) |
| Header, footer and menu | `src/components/Header.astro`, `src/components/Footer.astro` |

### Adding a fieldwork trip

1. Copy an existing folder in `src/content/fieldwork/`, e.g. `aurora-green-2026/`. The folder name becomes the URL (`/fieldwork/<folder>`).
2. Edit the details at the top of `index.md` (title, date, location, map coordinates, sectors, partners) and write the story below them.
3. Replace `cover.jpg` and put photos in `gallery/`. Images are resized and compressed automatically, so use the originals.

Trips appear on the fieldwork page and map, on the matching sector pages, and (if recent) on the home page.

### Adding a product

Copy a folder in `src/content/products/` and edit its `index.md`. `order` sets its position on the products page; specs, highlights and YouTube video IDs are listed at the top of the file.

## Notes

- Images belong in `src/` (not `public/`) so they are optimised at build time.
- Google Analytics only loads in production builds.
- The contact form posts to Formspree (`formEndpoint` in `src/data/company.ts`).
