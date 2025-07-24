import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import type { StoredUser } from '$lib/API/Auth/types';
import type { ITaskAPI } from '$lib/API/Tasks';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import { Err } from '$lib/Errors';
import { devStore } from '$lib/stores/devStore.svelte';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent, url }) => {
    // Initialize local auth provider
    const remoteAuth = await SupabaseAuthProvider.get();
    const remoteTaskAPI = await SupabaseTaskProvider.get();
    const auth = await BrowserAuthProvider.get(remoteAuth, remoteTaskAPI);

    // Check local account data first
    let activeUser = await auth.getActiveUser();
    if (!activeUser) {
        const anonRes = await auth.getAnonymousUser();
        if (anonRes.isOk()) {
            activeUser = anonRes.value;
        }
    }

    let user: StoredUser;
    let tasks: ITaskAPI;

    if (!activeUser) {
        // TODO Capture url and reroute to login page
        throw redirect(302, '/login');
    }

    if (activeUser.is_synced) {
        // User is synced with remote
        const remoteRes = await auth.getUser({ id: activeUser.id })
        if (remoteRes.isErr()) {
            Err.throw(remoteRes.error); // dev-throw
        }
        const remoteUser = remoteRes.value;

        user = {
            ...activeUser,
            ...remoteUser,
        };

        tasks = await BrowserTaskProvider.get(remoteTaskAPI);
        console.log("Using Browser-wrapped supabase task API");
    } else {
        // Use local auth
        user = activeUser;
        tasks = await BrowserTaskProvider.get();
        console.log("Using Browser-only task API");
    }

    tasks = await devStore.getTaskProviderOverride(tasks);

    // TODO: If the user logs in, make sure to sync data with the server

    return { auth, user, tasks };
};