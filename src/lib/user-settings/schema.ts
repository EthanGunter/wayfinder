import {
	BoolSetting,
	StringSetting,
	EnumSetting,
	NumberSetting,
	assignPaths,
	RangeSetting,
	type SettingsTree,
} from './types';
import { dev as devEnv } from '$app/environment';

export const settings = {
	dev: {
		$label: "Dev",
		$userFeature: "dev",
		// $enabled: new BoolSetting({
		// 	label: "Enabled",
		// 	desc: "Should dev settings have an effect on anything?",
		// 	defaultValue: dev,
		// }),
		core: {
			$label: "Global", enabled: new BoolSetting({
				label: "Enabled",
				desc: "Should dev settings have an effect on anything?",
				defaultValue: devEnv,
			})
		},
		overrides: {
			$label: 'Overrides',
		},
	}
} satisfies SettingsTree;

export type AppSettings = typeof settings;
export let dev = settings.dev.core.enabled;

assignPaths(settings);