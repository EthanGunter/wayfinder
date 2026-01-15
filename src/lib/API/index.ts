/** Shared ConvexClient instance for application-wide use */
export { sharedConvexClient } from './ConvexClient';

/** Stores for managing fetchable data states (loading, error, resolved) */
export type { FetchableStore, QueryableStore } from './fetchableStore';
export { createFetchableReadable, createQueryable } from './fetchableStore';

/** Reactive map implementation compatible with Svelte stores */
export { ReadableMap } from './ReadableMap';

/** Authentication API and state management */
export * from './Auth';

/** Task management API */
export { default as tasksAPI } from './Tasks';
