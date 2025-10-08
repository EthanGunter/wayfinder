import tailwindcss from '@tailwindcss/vite';
// import { paraglideVitePlugin } from '@inlang/paraglide-js';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()], // paraglideVitePlugin({
	// 	project: './project.inlang',
	// 	outdir: './src/lib/paraglide'
	// })
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib'),
			$domain: path.resolve(__dirname, 'src/domain'),
			$convex: path.resolve(__dirname, 'src/convex')
		}
	},
	// test: { setupFiles: ['src/vitest.setup.ts'] }
});
