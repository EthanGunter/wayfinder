import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import type { ILocalAuth, LocalUser } from '$lib/API/Auth/types';
import type { ITaskAPI } from '$lib/API/Tasks';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import { Err } from '$lib/Errors';
import { devStore } from '$lib/stores/devStore.svelte';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { page } from '$app/state';

export const load: LayoutLoad = async ({ parent, url }) => {
    // Initialize local auth provider for initial checks
    const [tempAuth] = await BrowserAuthProvider.get();

    // Check local account data first
    let activeUser = await tempAuth.getActiveUser();
    if (!activeUser) {
        const anonRes = await tempAuth.getDefaultUser();
        if (anonRes.isOk()) {
            activeUser = anonRes.value;
        } else {
            Err.throw(anonRes.error)
        }
    }

    let user: LocalUser;
    let auth: ILocalAuth;
    let tasks: ITaskAPI;

    if (!activeUser) {
        // TODO Capture url and reroute to login page

        throw redirect(302, `/login?redirectTo=${page.url}`);
    }

    if (activeUser.last_synced) {
        // User is synced with remote
        const remoteAuth = await SupabaseAuthProvider.get();
        const remoteRes = await remoteAuth.getUser({ id: activeUser.id })
        if (remoteRes.isErr()) {
            Err.throw(remoteRes.error);
        }
        const remoteUser = remoteRes.value;

        user = {
            ...activeUser,
            ...remoteUser,
        };

        const remoteTask = await SupabaseTaskProvider.get();
        const [taskAPI] = await BrowserTaskProvider.get(remoteTask);
        tasks = taskAPI;
        [auth] = await BrowserAuthProvider.get(remoteAuth, taskAPI);
        console.log("Using Browser-wrapped supabase task API");
    } else {
        // Use local auth
        user = activeUser;
        [tasks] = await BrowserTaskProvider.get();
        [auth] = await BrowserAuthProvider.get();
        console.log("Using Browser-only task API");
    }

    tasks = await devStore.getTaskProviderOverride(tasks);

    // TODO: If the user logs in, make sure to sync data with the server

    return { auth, user, tasks };
};