import {
	BoolSetting,
	StringSetting,
	EnumSetting,
	NumberSetting,
	assignPaths,
	RangeSetting,
	type SettingsTree,
} from './types';
import { dev } from '$app/environment';

export const settings = {
	dev: {
		$label: "Dev",
		$userFeature: "dev",
		root: {
			$label: "",
			enabled: new BoolSetting({
				label: "Enabled",
				desc: "Should dev settings have an effect on anything?",
				defaultValue: dev,
			}),
		},
		overrides: {
			$label: 'Overrides',

			supabaseTaskUrl: new StringSetting({
				label: 'Supabase Tasks URL',
				placeholder: import.meta.env?.VITE_SUPABASE_URL,
				hint: 'Restart is required for overrides to take effect',
				manualSave: true,
			}),
			supabaseTaskKey: new StringSetting({
				label: 'Supabase Tasks API Key',
				placeholder: import.meta.env?.VITE_SUPABASE_API_KEY,
				desc: "Use the service role API key or you will encounter RLS issues",
				hint: 'Restart is required for overrides to take effect',
				manualSave: true,
			}),
		},
	}
} satisfies SettingsTree;

export type AppSettings = typeof settings;

assignPaths(settings);