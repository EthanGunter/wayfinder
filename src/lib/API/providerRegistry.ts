import type { IAuth, ILocalAuth } from './Auth/types';
import type { ILocalTasks, ITasks } from './Tasks/types';
// Static imports for remote providers are safe in Service Worker contexts
import SupabaseAuthProvider from './Auth/SupabaseAuthProvider';
import SupabaseTaskProvider from './Tasks/SupabaseTaskProvider';

// Guard to avoid evaluating browser-only singletons in Service Worker / non-window contexts
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// Returns a thenable that only rejects when actually consumed (then/catch/finally called)
function createUnavailablePromise<T>(message: string): Promise<T> {
    const thenable: any = {
        then(onFulfilled?: any, onRejected?: any) {
            return Promise.reject(new Error(message)).then(onFulfilled, onRejected);
        },
        catch(onRejected?: any) {
            return Promise.reject(new Error(message)).catch(onRejected);
        },
        finally(onFinally?: any) {
            return Promise.reject(new Error(message)).finally(onFinally);
        },
        get [Symbol.toStringTag]() { return 'Promise'; }
    };
    return thenable as Promise<T>;
}

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
    // Lazily import browser providers to avoid pulling them into non-window contexts
    const [{ default: BrowserTaskProvider }, { default: BrowserAuthProvider }] = await Promise.all([
        import('./Tasks/BrowserTaskProvider'),
        import('./Auth/BrowserAuthProvider'),
    ]);

    const { auth: remoteAuth, tasks: remoteTasks } = await getRemoteProviders();
    const tasks = await BrowserTaskProvider.get(remoteTasks);
    const auth = await BrowserAuthProvider.get(remoteAuth, tasks);
    return { auth, tasks };
}

// Export singletons for app-wide consumption
const localProvidersPromise = isBrowser 
    ? getLocalProviders() 
    : createUnavailablePromise<{ auth: ILocalAuth, tasks: ILocalTasks }>('Local providers are not available in Service Worker or non-browser contexts');

export const taskAPIPromise: Promise<ILocalTasks> = localProvidersPromise.then(x => x.tasks);
export const authAPIPromise: Promise<ILocalAuth> = localProvidersPromise.then(x => x.auth);


