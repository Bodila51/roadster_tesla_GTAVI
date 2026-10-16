# Roadster: flying car playground

A free browser game: drive the 2026 Roadster, fire its cold-gas thrusters, hop the lineup, ride the reveal wall, flip, drift and land it clean. Built with Three.js and Vite.

Fan-made. Not affiliated with Tesla. No Tesla logos are used.

## Status

Work in progress. This first version is the readable source of the earlier "Roadster Unleashed" build and plays exactly like it. The new daytime look, model, sounds, phone layout and game modes land on `main` step by step, and only after they pass checks.

## Run locally

```
npm ci
npm run dev      # local dev server
npm run build    # production build into dist/
```

## Deploy on Vercel

Import this repository in Vercel. The Vite preset works as is: build command `npm run build`, output directory `dist`. Every push to `main` redeploys the site.

## Credits

See [CREDITS.md](CREDITS.md).
