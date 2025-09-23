import type { IAuth, IAuthLocal, ILocalAuth } from './Auth/types';
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
 * Configures providers and sets up remote connections.
 * Auth provider self-initializes via stores; tasks provider still uses .get() pattern.
 */
export async function configureProviders(): Promise<{ tasks: ILocalTasks }> {
    // Lazily import browser providers to avoid pulling them into non-window contexts
    const [{ default: BrowserTaskProvider }, { auth: localAuth, _configureRemoteAuth }] = await Promise.all([
        import('./Tasks/BrowserTaskProvider'),
        import('./Auth/BrowserAuthProvider'),
    ]);

    const { auth: remoteAuth, tasks: remoteTasks } = await getRemoteProviders();
    
    // Configure auth with remote provider (temporary until remoteAuth store exists)
    _configureRemoteAuth(remoteAuth);
    
    const tasks = await BrowserTaskProvider.get();
    return { tasks };
}

// Export singletons for app-wide consumption
const configuredProvidersPromise = isBrowser 
    ? configureProviders() 
    : createUnavailablePromise<{ tasks: ILocalTasks }>('Local providers are not available in Service Worker or non-browser contexts');

export const taskAPIPromise: Promise<ILocalTasks> = configuredProvidersPromise.then(x => x.tasks);

// Auth is now available directly from BrowserAuthProvider stores - no promise needed
// Legacy export for compatibility during migration
export const authAPIPromise: Promise<IAuthLocal> = isBrowser 
    ? import('./Auth/BrowserAuthProvider').then(({ auth }) => auth)
    : createUnavailablePromise<IAuthLocal>('Auth provider not available in Service Worker or non-browser contexts');


