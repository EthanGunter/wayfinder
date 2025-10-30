import staticAdapter from '@sveltejs/adapter-static';
import vercelAdapter from '@sveltejs/adapter-vercel'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const target = process.env.ADAPTER ?? 'vercel'; // default to vercel for CI

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: target === "vercel" ? vercelAdapter() :
      staticAdapter({
        pages: 'build',
        assets: 'build',
        fallback: 'index.html',
        precompress: false,
        strict: true
      }),
    alias: {
      "$lib": "./src/lib",
      "$domain": "./src/domain",
      "$convex": "./src/convex",
    },
    prerender: {
      // Reinforced: This ensures your SvelteKit app produces static HTML files.
      // For a PWA/Capacitor app, you generally want most (if not all) content prerendered
      // to enable offline access and fast initial load of the bundled assets.
      // A common strategy is to set `export const prerender = true;` in your
      // `src/routes/+layout.ts` to make all nested pages prerenderable by default.
    }
  }
};

export default config;