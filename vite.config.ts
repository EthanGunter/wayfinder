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
		alias: { $lib: path.resolve(__dirname, 'src/lib') }
	},
	test: { setupFiles: ['src/vitest.setup.ts'] }
});
