import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { Err } from '$domain/errors';

export type SyncQueueEntry = {
    id?: number;
    channel: string;
    fnName: string;
    args: any;
    handlerFnName?: string;
    revertArgs?: any;
    createdAt: string;
    tryCount: number;
    errors?: string[];
};

interface SyncDB extends DBSchema {
    sync_queue: {
        key: number;
        value: SyncQueueEntry;
        indexes: {
            'by-createdAt': string;
        };
    };
}

export const SYNC_DB_NAME = 'wayfinder-sync';
export const SYNC_STORE_NAME = 'sync_queue';

let syncDbPromise: Promise<IDBPDatabase<SyncDB>> | null = null;
function getDurableDB() {
    if (!syncDbPromise) {
        syncDbPromise = openDB<SyncDB>(SYNC_DB_NAME, 1, {
            upgrade(db) {
                const store = db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('by-createdAt', 'createdAt');
            },
        });
    }
    return syncDbPromise!;
}

export async function enqueueSyncCommand(
    channel: string,
    fnName: string,
    args: any,
    handlerFnName?: string,
    revertArgs?: any,
): Promise<void> {
    const db = await getDurableDB();
    const createdAt = new Date().toISOString();
    const entry: SyncQueueEntry = {
        channel,
        fnName,
        args,
        handlerFnName,
        revertArgs,
        createdAt,
        tryCount: 0,
    };
    await db.add(SYNC_STORE_NAME, entry);
    await processQueueInClient();
}

export async function requestBackgroundSync(): Promise<void> {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.ready;
            const syncMgr = (reg as any).sync;
            if (syncMgr && typeof syncMgr.register === 'function') {
                // Do not let Background Sync failures block immediate processing
                syncMgr.register('wayfinder-sync').catch((e: any) => {
                    console.debug('Background Sync unavailable/denied; proceeding with immediate message', e);
                });
            }
            // Try to message the active worker directly (works even if page not yet controlled)
            reg.active?.postMessage({ type: 'process-sync-queue' });
            // Also try controller as a secondary path when available
            navigator.serviceWorker.controller?.postMessage({ type: 'process-sync-queue' });
        } catch (e) {
            console.log("error requesting sync", e);
            // Best-effort: still attempt to message via controller if available
            try { navigator.serviceWorker.controller?.postMessage({ type: 'process-sync-queue' }); } catch {}
        }
    } else {
        console.log("serviceWorker not in navigator...");
    }
}

// #region Client queue processing helpers
async function takeNextBatch(limit = 50): Promise<SyncQueueEntry[]> {
    const db = await getDurableDB();
    const tx = db.transaction(SYNC_STORE_NAME, 'readonly');
    const store = tx.store as any;
    const idx = store.index('by-createdAt');
    const cursor = await idx.openCursor();
    const batch: SyncQueueEntry[] = [];
    let cur = cursor;
    while (cur && batch.length < limit) {
        batch.push(cur.value as SyncQueueEntry);
        cur = await cur.continue();
    }
    await tx.done;
    return batch;
}

async function markDone(id: number): Promise<void> {
    const db = await getDurableDB();
    await db.delete(SYNC_STORE_NAME, id);
}

function formatErrorForLog(error: unknown): string {
    try {
        if (error instanceof Err) {
            return `${error.name}: ${error.message}`;
        }
        if (error instanceof Error) {
            return `${error.name}: ${error.message}`;
        }
        if (typeof error === 'string') return error;
        if (error && typeof error === 'object') {
            const anyErr = error as any;
            const type = anyErr?.type ?? anyErr?.name ?? 'UnknownError';
            const msg = anyErr?.message ?? JSON.stringify(anyErr);
            return `${type}: ${msg}`;
        }
        return String(error);
    } catch {
        return 'UnknownError: <unformattable error>';
    }
}

async function markFailed(id: number, error: any): Promise<void> {
    const db = await getDurableDB();
    const item = await db.get(SYNC_STORE_NAME, id) as SyncQueueEntry | undefined;
    if (!item) return;
    item.tryCount += 1;
    const newError = formatErrorForLog(error);
    if (newError && !item.errors) item.errors = [];
    item.errors?.push(newError);
    await db.put(SYNC_STORE_NAME, item);
}

let processing = false;
export async function processQueueInClient(): Promise<void> {
    if (processing) return;
    processing = true;
    try {
        // Lazy-load facades to avoid circular deps
        const { authAPI } = await import('./Auth');
        const { tasksAPI } = await import('./Tasks');
        const batch = await takeNextBatch(50);
        for (const entry of batch) {
            try {
                switch (entry.channel) {
                    case 'auth': {
                        const fn = (authAPI as any)[entry.fnName];
                        if (typeof fn !== 'function') throw new Error(`Auth function not found: ${entry.fnName}`);
                        const res = await fn(entry.args);
                        if (res?.isErr?.()) throw res.error;
                        await markDone(entry.id!);
                        break;
                    }
                    case 'tasks': {
                        const fn = (tasksAPI as any)[entry.fnName];
                        if (typeof fn !== 'function') throw new Error(`Tasks function not found: ${entry.fnName}`);
                        const res = await fn(entry.args);
                        if (res?.isErr?.()) throw res.error;
                        await markDone(entry.id!);
                        break;
                    }
                    default:
                        throw new Error(`Unknown channel: ${entry.channel}`);
                }
            } catch (e) {
                console.error('Queue entry failed', e);
                // TODO:sync/auth Consider per-user queue partitioning or embedding auth context to avoid
                //       repeatedly failing entries for another user. Today we mark failed and continue.
                //       If the error is an RLS/permission error (e.g., 401/403), this likely belongs to a different user.
                await markFailed(entry.id!, e);
                continue; // continue processing others; leave this item for later (e.g., when the right user logs in)
            }
        }
    } catch (e) {
        // Swallow to avoid unhandled rejection; errors are recorded per entry
    } finally {
        processing = false;
    }
}

// Attach online listener to retry processing when connectivity returns
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => { processQueueInClient(); });
}
// #endregion
