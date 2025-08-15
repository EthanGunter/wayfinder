import type { ITasks } from '$lib/API/Tasks';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
// import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';

// Define available task providers
export const TASK_PROVIDER_OVERRIDES = {
	browser: 'Browser (Local)',
	supabase: 'Supabase (Cloud)',
	native: 'Native (SQLite)',
	none: 'Auto (Based on Auth)'
} as const;

export type TaskProviderKey = keyof typeof TASK_PROVIDER_OVERRIDES;

// Single storage key for all dev settings
const STORAGE_KEY = 'wayfinder.devSettings';

interface DevSettings {
	taskProviderOverride: TaskProviderKey;
	devMode: boolean;
	debugMode: boolean;
}

const defaultSettings: DevSettings = {
	taskProviderOverride: 'none',
	devMode: false,
	debugMode: false
};

class DevStore {
	// Private state for internal storage
	#settings = $state<DevSettings>(this.loadSettings());

	// Public getters and setters with auto-save
	get taskProviderOverride() {
		return this.#settings.taskProviderOverride;
	}
	set taskProviderOverride(value: TaskProviderKey) {
		this.#settings.taskProviderOverride = value;
		this.saveSettings();
	}

	get devMode() {
		return this.#settings.devMode;
	}
	set devMode(value: boolean) {
		this.#settings.devMode = value;
		this.saveSettings();
		window.location.reload();
	}

	get debugMode() {
		return this.#settings.debugMode;
	}
	set debugMode(value: boolean) {
		this.#settings.debugMode = value;
		this.saveSettings();
	}

	// Load settings from localStorage
	private loadSettings(): DevSettings {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				// Validate and merge with defaults to handle missing properties
				return { ...defaultSettings, ...parsed };
			}
		} catch (e) {
			console.warn('Failed to load dev settings from localStorage:', e);
		}
		return { ...defaultSettings };
	}

	// Save current settings to localStorage
	private saveSettings(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#settings));
		} catch (e) {
			console.warn('Failed to save dev settings to localStorage:', e);
		}
	}

	// Methods
	async getTaskProviderOverride(defaultProvider: ITasks): Promise<ITasks> {
		if (this.devMode && this.taskProviderOverride !== 'none') {
			console.log(`Overriding default task provider with ${this.taskProviderOverride}`);

			switch (this.taskProviderOverride) {
				case 'supabase':
					throw new Error("Supabase task provider not implemented (postponed)");
					// return await SupabaseTaskProvider.get();
				case 'native': throw new Error("Native task provider not implemented");
			}
		}
		return defaultProvider;
	}

	// Reset all dev settings
	reset() {
		this.#settings = { ...defaultSettings };
		localStorage.removeItem(STORAGE_KEY);
	}

	// Export current settings as JSON
	exportSettings(): string {
		return JSON.stringify(this.#settings, null, 2);
	}

	// Import settings from JSON
	importSettings(json: string): void {
		try {
			const settings = JSON.parse(json);
			this.#settings = { ...defaultSettings, ...settings };
			this.saveSettings();
		} catch (e) {
			console.error('Failed to import dev settings:', e);
		}
	}

	// Get all settings at once (useful for debugging)
	getAllSettings(): Readonly<DevSettings> {
		return { ...this.#settings };
	}
}

// Create singleton instance
export const devStore = new DevStore();