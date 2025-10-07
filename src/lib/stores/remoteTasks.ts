import { writable } from 'svelte/store';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import type { ITasks } from '$domain/models/task';
import { userHasFeature, type LocalUser } from '$domain/models/user';

// TODO:refactor Move this code to /Tasks/index.ts
// Canonical source for whether remote task operations are available.
// null => remote disabled/unavailable; non-null => remote enabled and usable.
export const remoteTasks = writable<ITasks | null>(null);

// Subscribe to auth state changes and set/clear the remote tasks provider.
const updateRemoteTasks = async (user: LocalUser | null) => {
  if (user && userHasFeature(user, 'task-sync')) {
    remoteTasks.set(SupabaseTaskProvider);
  } else {
    remoteTasks.set(null);
  }
};

// Dynamically import authState to avoid initialization order issues
(async () => {
  try {
    const { authState } = await import('$lib/API/Auth');
    authState.subscribe((state) => {
      if (state.status === 'signed-in' && state.user) {
        updateRemoteTasks(state.user);
      } else {
        remoteTasks.set(null);
      }
    });
  } catch (e) {
    console.error('Failed to subscribe to auth state in remoteTasks:', e);
  }
})();

