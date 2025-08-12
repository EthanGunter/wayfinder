import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import type { IAuth, ILocalAuth } from '$lib/API/Auth/types';
import type { ITasks, ILocalTasks } from '$lib/API/Tasks';
import type { PageLoad } from './$types';
import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import type { LocalUser } from '$lib/API/Auth/User';

type UpgradePageData = {
    user: LocalUser;
    auth: ILocalAuth; // This will be the BrowserAuthProvider wrapped around remote APIs
    tasks: ITasks; // This will be the BrowserTaskProvider wrapped around remote APIs
    // Keep the original APIs for comparison/debugging if needed
    currentAuth: ILocalAuth;
    currentTasks: ITasks;
};

export const load: PageLoad<UpgradePageData> = async ({ parent }) => {
    // Get the layout data which contains the user's current sync status
    const { user, auth: currentAuth, tasks: currentTasks } = await parent();

    // For upgrade, we need the remote APIs regardless of current sync status
    const remoteAuth = await SupabaseAuthProvider.get();
    const remoteTasks = await SupabaseTaskProvider.get();
    
    // Wrap the remote APIs with Browser providers to get the local functionality
    const tasks = await BrowserTaskProvider.get(remoteTasks);
    const auth = await BrowserAuthProvider.get(remoteAuth, tasks);

    return {
        user,
        auth, // Remote APIs wrapped with Browser providers
        tasks, // Remote APIs wrapped with Browser providers
        currentAuth, // Original local APIs
        currentTasks, // Original local APIs
    };
};
