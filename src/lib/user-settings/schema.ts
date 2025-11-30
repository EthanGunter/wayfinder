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
	graph: {
		$label: "Graph",
		core: {
			$label: "Visibility",
			showCompleted: new BoolSetting({
				label: "Show completed",
				desc: "Should completed tasks be shown in the graph",
				defaultValue: true,
			}),
		}
	},
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
	}
} satisfies SettingsTree;

export type AppSettings = typeof settings;
assignPaths(settings);