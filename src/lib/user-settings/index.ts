export * from './schema'
export { assignPaths, DictSetting, BoolSetting, StringSetting, NumberSetting, EnumSetting, type AnySetting, type SettingsTree } from './types';

import { settings } from './schema';
import { dbPromise, APP_TABLE_NAME } from '$lib/API/localDB';
import { Err } from '$domain/errors';

// Apply settings from a plain path->value object to the tree silently
function applySettings(tree: Record<string, any>, overrides: Record<string, any>): void {
    for (const [path, value] of Object.entries(overrides)) {
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

// Collect paths for settings marked scope==='device'
function collectDeviceSettingPaths(tree: Record<string, any>): string[] {
    const paths: string[] = [];
    for (const [tabId, tab] of Object.entries(tree)) {
        for (const [sectionId, section] of Object.entries(tab as any)) {
            if (sectionId.startsWith('$')) continue;
            const sec = section as Record<string, any>;
            for (const [itemId, setting] of Object.entries(sec)) {
                if (itemId.startsWith('$')) continue;
                if (setting && typeof setting === 'object' && 'id' in setting && 'scope' in setting) {
                    if ((setting as any).scope === 'device') {
                        paths.push(`${tabId}/${sectionId}/${itemId}`);
                    }
                }
            }
        }
    }
    return paths;
}

// Exported promise: resolves when device-scoped settings have been loaded from IDB
export const deviceSettingsReady: Promise<void> = (async () => {
    try {
        const db = await dbPromise;
        const paths = collectDeviceSettingPaths(settings);
        if (paths.length === 0) return;
        const tx = db.transaction(APP_TABLE_NAME);
        const loads = paths.map(async (p) => {
            try {
                const raw = await tx.store.get(`settings:${p}`);
                if (raw == null) return undefined;
                return [p, JSON.parse(String(raw))] as [string, any];
            } catch {
                return undefined;
            }
        });
        const entries = (await Promise.all(loads)).filter((e): e is [string, any] => Array.isArray(e));
        const overrides = Object.fromEntries(entries);
        applySettings(settings, overrides);
    } catch (e) {
        console.warn('Failed to initialize device settings', e);
    }
})();

// Initialize settings from user object (dynamic import to avoid early cycles)
void (async () => {
    const { authAPI } = await import('$lib/API/Auth');
    const [user, error] = await authAPI.getUser();
    if (error) Err.UNHANDLED(error);

    if (user && user.setting_overrides) {
        applySettings(settings, user.setting_overrides);
    }
})();
