import SupabaseAuth from '$lib/API/Auth/SupabaseAuth';
import type { LocalUserProxy } from '$lib/API/Auth/types';
import type { ITaskProvider } from '$lib/API/Tasks';
import browserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import supabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import { devStore } from '$lib/stores/devStore.svelte';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad<{ user: LocalUserProxy, taskAPI: ITaskProvider }> = async ({ parent, url }) => {
    const dbAuth = new SupabaseAuth();
    let fetched = await dbAuth.getCurrentUser();
    let user: LocalUserProxy;

    let taskAPI: ITaskProvider;

    // If there is no synced user session
    if (!fetched) {
        // Create a local account if there is none
        // TODO write the anonymous user to the local db
        user = { id: "local-anon", displayName: "local anonymous", isSynced: false }
        taskAPI = await browserTaskProvider.get();
    } else {
        user = fetched as any;
        user.isSynced = true;
        taskAPI = await supabaseTaskProvider.get();
    }

    taskAPI = await devStore.getTaskProviderOverride(taskAPI);
    console.log("taskAPIOverride:", devStore.taskProviderOverride);

    // On the home page, offer a "login" & "get started locally" option
    // If the user logs in, make sure to migrate any local data

    return { user, taskAPI };
};