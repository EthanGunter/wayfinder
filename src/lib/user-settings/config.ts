import { DictSetting, assignPaths, type SettingsTree } from './types';

export const settings = {
	dev: {
		$label: 'Dev',
		overrides: {
			$label: 'Overrides',
			envVars: new DictSetting({
				label: 'Environment Variables',
				hint: 'Restart is required for overrides to take effect'
			}),
		},
	},
} satisfies SettingsTree;

export type AppSettings = typeof settings;

assignPaths(settings);
