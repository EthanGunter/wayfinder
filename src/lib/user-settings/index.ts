export * from './schema'
export { assignPaths, DictSetting, BoolSetting, StringSetting, NumberSetting, EnumSetting, type AnySetting, type SettingsTree } from './types';

import { settings } from './schema';
import { Err } from '$domain/errors';
import { derived } from 'svelte/store';
import { hasFeature } from '$lib/API/Auth';

export const devEnabled = derived([hasFeature('dev'), settings.dev.core.enabled], ([a, b]) => a && b);

// Flatten nested object to path->value pairs (e.g., { dev: { $enabled: true } } -> { "dev/$enabled": true })
function flattenSettings(obj: Record<string, any>, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}/${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            // Recursively flatten nested objects
            Object.assign(result, flattenSettings(value, path));
        } else {
            // Leaf value
            result[path] = value;
        }
    }
    return result;
}

// Apply settings from a nested or flat path->value object to the tree silently
function applySettings(tree: Record<string, any>, overrides: Record<string, any>): void {
    // Flatten in case we receive nested structure from server
    const flatOverrides = flattenSettings(overrides);

    for (const [path, value] of Object.entries(flatOverrides)) {
        const parts = path.split('/');

        // Handle tab-level settings (e.g., "dev/$enabled")
        if (parts.length === 2) {
            const [tabId, itemId] = parts;
            const tab = tree[tabId];
            if (!tab) continue;
            const setting = tab[itemId];
            if (setting && typeof setting === 'object' && 'setSilently' in setting) {
                setting.setSilently(value);
            }
            continue;
        }

        // Handle section-level settings (e.g., "dev/overrides/supabaseTaskUrl")
        if (parts.length === 3) {
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

// Initialize settings from user object (dynamic import to avoid early cycles)
void (async () => {
    const { authAPI } = await import('$lib/API/Auth');
    authAPI.watchAuthState().subscribe(state => {
        switch (state.status) {
            case 'error':
                Err.UNHANDLED(state.error);
                break;
            case 'signed-in':
                if (state.user.settingOverrides) {
                    applySettings(settings, state.user.settingOverrides);
                }
            default:
                break;
        }
    });

})();
