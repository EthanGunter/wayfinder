import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import type { StoredUser } from '$lib/API/Auth/types';
import type { ITaskAPI } from '$lib/API/Tasks';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import type { ILocalTaskProvider } from '$lib/API/types';
import { Err, ErrorType } from '$lib/Errors';
import { devStore } from '$lib/stores/devStore.svelte';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent, url }) => {
    // Initialize local auth provider
    const remoteAuth = await SupabaseAuthProvider.get();
    const auth = await BrowserAuthProvider.get(remoteAuth);

    // Check local account data first
    let currentUser = await auth.getMostRecentUser();
    if (!currentUser) {
        // Create a temp account
        currentUser = await auth.activateNewAnonymousUser();
    }

    // TODO This seems convoluted and unnecessary
    let remoteUser = currentUser.is_synced && await auth.getCurrentUser();

    let user: StoredUser;
    let tasks: ITaskAPI;

    if (remoteUser) {
        // User is synced with remote
        user = {
            ...currentUser,
            ...remoteUser,
        };
        const remoteTaskAPI = await SupabaseTaskProvider.get();
        tasks = await BrowserTaskProvider.get(remoteTaskAPI);
        console.log("Using Browser-wrapped supabase task API");
    } else {
        // Use local auth
        const localUser = await auth.getCurrentUser();
        if (localUser.isErr()) {
            if (localUser.error.type == ErrorType.NotFoundError) {
                // This shouldn't happen as LocalAuthProvider creates anonymous user on init
                throw new Error('No user found');
            }

            Err.throw(localUser.error);
        }

        user = localUser.value as StoredUser; // TODO don't cast, convert
        tasks = await BrowserTaskProvider.get();
    }

    tasks = await devStore.getTaskProviderOverride(tasks);

    // TODO: If the user logs in, make sure to migrate any local data

    return { user, auth, tasks };
};

function customThrow(): never { throw {} }
class tClass {
    customThrow: () => never = () => { throw {} }
}