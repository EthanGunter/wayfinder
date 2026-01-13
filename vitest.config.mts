import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from 'path';

export default defineConfig(({ mode }) => {
	// Make `.env.test.local` available even in Cursor's test explorer runs.
	const env = loadEnv(mode ?? "test", process.cwd(), "");
	for (const [k, v] of Object.entries(env)) process.env[k] = v;

	return {
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
	};
});
