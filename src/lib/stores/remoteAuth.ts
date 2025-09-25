import { writable } from 'svelte/store';
import type { IAuth } from '$lib/API/Auth/types';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';

// Canonical source for whether remote auth operations are available.
// null => remote unavailable; non-null => remote enabled and usable.
export const remoteAuth = writable<IAuth | null>(null);

(async () => {
  try {
    const provider = await SupabaseAuthProvider.get();
    remoteAuth.set(provider);
  } catch (e) {
    console.error('Failed to initialize remoteAuth provider:', e);
    remoteAuth.set(null);
  }
})();


