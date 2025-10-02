export * from './config'
export * from './schema';
export { assignPaths, DictSetting, BoolSetting, StringSetting, NumberSetting, EnumSetting, type AnySetting, type SettingsTree } from './types';

import { authAPI } from '@/API/Auth';
import { settings } from './config';

// Helper to apply settings from user object to settings tree without triggering persistence
function applySettingsFromUser(tree: Record<string, any>, userSettings: Record<string, any>): void {
	for (const [path, value] of Object.entries(userSettings)) {
		const parts = path.split('/');
		if (parts.length !== 3) continue;
		const [tabId, sectionId, itemId] = parts;
		const tab = tree[tabId];
		if (!tab) continue;
		const section = tab[sectionId];
		if (!section || typeof section === 'string') continue;
		const setting = (section as any)[itemId];
		if (setting && typeof setting === 'object' && 'setSilently' in setting) {
			setting.setSilently(value);
		}
	}
}

// Initialize settings from user object
void (async () => {
	try {
		const userResponse = await authAPI.getUser();
		if (userResponse.isOk() && userResponse.value.setting_overrides) {
			applySettingsFromUser(settings, userResponse.value.setting_overrides);
		}
	} catch (e) {
		console.warn('Failed to initialize settings from user', e);
	}
})();
