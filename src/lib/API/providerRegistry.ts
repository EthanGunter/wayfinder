import SupabaseAuthProvider from './Auth/SupabaseAuthProvider';
import SupabaseTaskProvider from './Tasks/SupabaseTaskProvider';
import BrowserAuthProvider from './Auth/BrowserAuthProvider';
import BrowserTaskProvider from './Tasks/BrowserTaskProvider';
import type { IAuth, ILocalAuth } from './Auth/types';
import type { ILocalTasks, ITasks } from './Tasks/types';

/**
 * Returns remote providers (compile-time selected here).
 */
export async function getRemoteProviders(): Promise<{ auth: IAuth, tasks: ITasks }> {
    const [auth, tasks] = await Promise.all([
        SupabaseAuthProvider.get(),
        SupabaseTaskProvider.get(),
    ]);
    return { auth, tasks };
}

/**
 * Returns local providers configured with their remotes.
 * Centralizes Browser/SQLite selection and remote pairing.
 */
export async function getLocalProviders(): Promise<{ auth: ILocalAuth, tasks: ILocalTasks }> {
    const { auth: remoteAuth, tasks: remoteTasks } = await getRemoteProviders();
    const tasks = await BrowserTaskProvider.get(remoteTasks);
    const auth = await BrowserAuthProvider.get(remoteAuth, tasks);
    return { auth, tasks };
}

// Export singletons for app-wide consumption
const localProvidersPromise = getLocalProviders();
export const taskAPIPromise = localProvidersPromise.then(x => x.tasks) as Promise<ILocalTasks>;
export const authAPIPromise = localProvidersPromise.then(x => x.auth) as Promise<ILocalAuth>;


