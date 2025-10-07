import { writable } from 'svelte/store';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import type { IAuth } from '$domain/models/user';

// Canonical source for whether remote auth operations are available.
// null => remote unavailable; non-null => remote enabled and usable.
export const remoteAuth = writable<IAuth | null>(null);

(async () => {
  try {
    remoteAuth.set(SupabaseAuthProvider);
  } catch (e) {
    console.error('Failed to initialize remoteAuth provider:', e);
    remoteAuth.set(null);
  }
})();


