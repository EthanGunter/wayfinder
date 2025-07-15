import type { ITaskProvider } from '$lib/API/Tasks';
import browserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import supabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';

// Define available task providers
export const TASK_PROVIDER_OVERRIDES = {
	browser: 'Browser (Local)',
	supabase: 'Supabase (Cloud)',
	native: 'Supabase (Cloud)',
	none: 'Auto (Based on Auth)'
} as const;

export type TaskProviderKey = keyof typeof TASK_PROVIDER_OVERRIDES;

class DevStore {
	// State variables
	taskProviderOverride = $state<TaskProviderKey>('none');

	// Additional dev variables can be added here
	devMode = $state(false);

	// Methods
	async getTaskProviderOverride(defaultProvider: ITaskProvider): Promise<ITaskProvider> {
		if (this.devMode) {
			switch (this.taskProviderOverride) {
				case 'browser':
					return await browserTaskProvider.get();
				case 'supabase':
					return await supabaseTaskProvider.get();
			}
		}
		return defaultProvider;
	}

	// Reset all dev settings
	reset() {
		this.taskProviderOverride = 'none';
		this.devMode = false;
	}
}

// Create singleton instance
export const devStore = new DevStore();