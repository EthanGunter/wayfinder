import { StringSetting, assignPaths, type SettingsTree } from './types';

export const settings = {
	dev: {
		$label: 'Dev',

		overrides: {
			$label: 'Overrides',
			supabaseUrl: new StringSetting({
				label: 'Supabase URL',
				placeholder: import.meta.env?.VITE_SUPABASE_URL,
				hint: 'Restart is required for overrides to take effect',
			}),
			supabaseKey: new StringSetting({
				label: 'Supabase API Key',
				placeholder: import.meta.env?.VITE_SUPABASE_API_KEY,
				desc:"Use the service role API key or you will encounter RLS issues",
				hint: 'Restart is required for overrides to take effect',
			}),
		},

	},
} satisfies SettingsTree;

export type AppSettings = typeof settings;

assignPaths(settings);
