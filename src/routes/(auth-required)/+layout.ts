import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import { isAnonymous, type LocalUser } from '$lib/API/Auth/User';
import type { ILocalAuth } from '$lib/API/Auth/types';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { page } from '$app/state';

export const load: LayoutLoad = async ({ parent, url }) => {
    // Always initialize remote providers - they're always available
    const remoteAuth = await SupabaseAuthProvider.get();
    const remoteTaskProvider = await SupabaseTaskProvider.get();

    const tasks = await BrowserTaskProvider.get(remoteTaskProvider);
    const auth = await BrowserAuthProvider.get(remoteAuth, tasks);

    // Check local account data first
    let activeUser = await auth.getActiveUser();
    if (!activeUser) {
        const anonRes = await auth.getDefaultUser();
        if (anonRes.isOk()) {
            activeUser = anonRes.value;
        } else {
            throw redirect(302, `/login?redirectTo=${page.url}`);
        }
    }

    let user: LocalUser;

    if (isAnonymous(activeUser)) {
        // Anonymous user - local only
        user = activeUser;
    } else {
        // Non-anonymous user always has remote account
        // TODO need to establish a way to ensure the local and remote are *always* in sync
        const remoteRes = await remoteAuth.getUser({ id: activeUser.id });
        if (remoteRes.isErr()) {
            // Remote user not found - fall back to local
            user = activeUser;
        } else {
            // Remote user exists - merge data
            // TODO need to establish a way to ensure the local and remote are *always* in sync
            const remoteUser = remoteRes.value;

            // Create a new LocalUser instance with merged data
            user = {
                ...activeUser,
                ...remoteUser,
                created_at: activeUser.created_at,
            };
        }
    }

    // tasks = await devStore.getTaskProviderOverride(tasks);

    return { auth, user, tasks };
};