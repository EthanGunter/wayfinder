import localAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import SupabaseAuth from '$lib/API/Auth/SupabaseAuth';
import type { StoredUser } from '$lib/API/Auth/types';
import type { ITaskProvider } from '$lib/API/Tasks';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import { devStore } from '$lib/stores/devStore.svelte';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad<{ user: StoredUser, taskAPI: ITaskProvider }> = async ({ parent, url }) => {
    // Initialize local auth provider
    const localAuth = await localAuthProvider.get();

    // Check local account data first
    let currentUser = await localAuth.getMostRecentUser();
    if (!currentUser) {
        // Create a temp account
        currentUser = await localAuth.activateNewAnonymousUser();
    }

    const dbAuth = new SupabaseAuth();
    let remoteUser = currentUser.is_synced && await dbAuth.getCurrentUser();

    let user: StoredUser;
    let taskAPI: ITaskProvider;

    if (remoteUser) {
        // User is synced with remote
        user = {
            ...remoteUser,
            is_synced: true,
            last_active: new Date()
        } as StoredUser;
        taskAPI = await SupabaseTaskProvider.get();

        // TODO: Update local auth provider with remote user info for offline access
    } else {
        // Use local auth
        const localUser = await localAuth.getCurrentUser();
        if (!localUser) {
            // This shouldn't happen as LocalAuthProvider creates anonymous user on init
            throw new Error('No user found');
        }
        user = localUser;
        taskAPI = await BrowserTaskProvider.get();
    }

    taskAPI = await devStore.getTaskProviderOverride(taskAPI);

    // TODO: If the user logs in, make sure to migrate any local data
    // TODO: Wrap the task API so we call the local provider first, then the remote,
    // TODO: and handle rolling back local changes whenever the remote fails...
    
    return { user, authAPI: localAuth, taskAPI };
};