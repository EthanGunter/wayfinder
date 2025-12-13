import type { Snippet } from 'svelte';
import { writable } from 'svelte/store';

export type ModalSnippetArgs<TResult = unknown, TOptions = unknown> = {
  resolve: (value: TResult) => void;
  reject: (reason?: unknown) => void;
  options: TOptions;
};
export type ModalDescriptor<TResult = unknown, TOptions = unknown> = {
  // The thing that actually renders the content (body+buttons etc)
  // It gets resolve/reject passed in, so it can handle closing directly.
  //
  // Example:
  //   snippet: ({ resolve, reject, options }) => MyRouteModal({ resolve, options })
  //
  snippet: Snippet<[ModalSnippetArgs<TResult, TOptions>]>;

  // Optional: for debugging / devtools
  id?: string;

  // Raw options payload, opaque to the host, typed by caller.
  options: TOptions;
};

type InternalState =
  | {
    open: true;
    descriptor: ModalDescriptor<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
  | {
    open: false;
    descriptor: null;
    resolve: null;
    reject: null;
  };

const { subscribe, set, update } = writable<InternalState>({
  open: false,
  descriptor: null,
  resolve: null,
  reject: null,
});

export const modalState = { subscribe };

export function showCustomModal<
  TOptions,
  TResult = unknown,
>(
  descriptor: {
    snippet: Snippet<[{
      resolve: (value: TResult) => void;
      reject: (reason?: unknown) => void;
      options: TOptions;
    }]>;
    id?: string;
    options: TOptions;
  },
): Promise<TResult> {
  return new Promise<TResult>((outerResolve, outerReject) => {
    set({
      open: true,
      descriptor: descriptor as ModalDescriptor<TResult>,
      resolve: (value: unknown) => {
        outerResolve(value as TResult);
      },
      reject: (reason?: unknown) => {
        outerReject(reason);
      },
    });
  });
}

export function _resolveCurrentModal(value: unknown) {
  update((state) => {
    if (state.open && state.resolve) {
      state.resolve(value);
    }
    return { open: false, descriptor: null, resolve: null, reject: null };
  });
}

export function _rejectCurrentModal(reason?: unknown) {
  update((state) => {
    if (state.open && state.reject) {
      state.reject(reason);
    }
    return { open: false, descriptor: null, resolve: null, reject: null };
  });
}

export function _closeCurrentModal() {
  // Close without resolving; caller decides if that means undefined, reject, etc.
  return _rejectCurrentModal();
}