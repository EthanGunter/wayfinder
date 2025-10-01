import { writable, derived, type Writable } from 'svelte/store';
import type { IAuth, ILocalAuth } from '$lib/API/Auth/types';
import type { ILocalTasks, ITasks } from '$lib/API/Tasks/types';
import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';

interface ServiceStore {
  auth: IAuth | null;
  tasks: ITasks | null;
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
      // Initialize in dependency order
      const tasks = await BrowserTaskProvider.get();
      const auth = await BrowserAuthProvider.get();

      set({ auth, tasks, isInitialized: true });
    },
    setAuth: (auth: ILocalAuth) => update(s => ({ ...s, auth })),
    setTasks: (tasks: ILocalTasks) => update(s => ({ ...s, tasks })),
    reset: () => set({ auth: null, tasks: null, isInitialized: false })
  };
};

export const services = createServiceStore();

// Export promises that layout can await
export const taskAPIPromise = BrowserTaskProvider.get();
export const authAPIPromise = BrowserAuthProvider.get();
