import tailwindcss from '@tailwindcss/vite';
// import { paraglideVitePlugin } from '@inlang/paraglide-js';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import * as path from 'path';


export default defineConfig(({ mode }) => {
	// Load env file based on mode
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
		resolve: {
			alias: {
				$lib: path.resolve(__dirname, 'src/lib'),
				$domain: path.resolve(__dirname, 'src/domain'),
				$convex: path.resolve(__dirname, 'src/convex')
			}
		},
	};
});
