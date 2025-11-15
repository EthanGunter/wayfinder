import { defineConfig } from "vitest/config";
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: "edge-runtime",
		server: { deps: { inline: ["convex-test"] } },
	},
	resolve: {
		alias: {
			'$domain': path.resolve(__dirname, './src/domain'),
			'$lib': path.resolve(__dirname, './src/lib'),
			'$convex': path.resolve(__dirname, './src/convex'),
		},
	},
});