import { writable, type Writable } from 'svelte/store';
import type { ILocalAuth } from '$lib/API/Auth/types';
import type { ILocalTasks } from '$lib/API/Tasks/types';
import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
// Tasks remote will be wired in a later slice

// Create singletons to ensure consistent configuration across store and exports
const tasksAPIPromise = BrowserTaskProvider.get();
const remoteAuthPromise = SupabaseAuthProvider.get();
const authAPIPromiseInternal: Promise<ILocalAuth> = (async () => {
  const [remoteAuth, tasks] = await Promise.all([remoteAuthPromise, tasksAPIPromise]);
  return BrowserAuthProvider.get(remoteAuth, tasks);
})();

interface ServiceStore {
  auth: ILocalAuth | null;
  tasks: ILocalTasks | null;
  isInitialized: boolean;
}

const createServiceStore = () => {
  const { subscribe, set, update }: Writable<ServiceStore> = writable({
    auth: null,
    tasks: null,
    isInitialized: false
  });

  return {
    subscribe,
    initialize: async () => {
      const [auth, tasks] = await Promise.all([authAPIPromiseInternal, tasksAPIPromise]);

      // Hook online event to drain any pending queues
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          auth.getSyncQueue()?.process?.();
          tasks.getSyncQueue?.()?.process?.();
        });
      }

      set({ auth, tasks, isInitialized: true });
    },
    setAuth: (auth: ILocalAuth) => update(s => ({ ...s, auth })),
    setTasks: (tasks: ILocalTasks) => update(s => ({ ...s, tasks })),
    reset: () => set({ auth: null, tasks: null, isInitialized: false })
  };
};

export const services = createServiceStore();

// Export promises that layout can await
export const taskAPIPromise = tasksAPIPromise;
export const authAPIPromise = authAPIPromiseInternal;
