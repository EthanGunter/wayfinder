import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

// #region Durable queue (processed by Service Worker)
export type DurableSyncQueueEntry = {
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
        value: DurableSyncQueueEntry;
        indexes: {
            'by-createdAt': string;
        };
    };
}

export const DURABLE_DB_NAME = 'wayfinder-sync';
export const DURABLE_STORE_NAME = 'sync_queue';

let durableDbPromise: Promise<IDBPDatabase<SyncDB>> | null = null;
function getDurableDB() {
    if (!durableDbPromise) {
        durableDbPromise = openDB<SyncDB>(DURABLE_DB_NAME, 1, {
            upgrade(db) {
                const store = db.createObjectStore(DURABLE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('by-createdAt', 'createdAt');
            },
        });
    }
    return durableDbPromise!;
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
    const entry: DurableSyncQueueEntry = {
        channel,
        fnName,
        args,
        handlerFnName,
        revertArgs,
        createdAt,
        tryCount: 0,
    };
    await db.add(DURABLE_STORE_NAME, entry);
    await requestBackgroundSync();
}

export async function requestBackgroundSync(): Promise<void> {
    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            const syncMgr = (reg as any).sync;
            if (syncMgr && typeof syncMgr.register === 'function') {
                await syncMgr.register('wayfinder-sync');
            }
            navigator.serviceWorker.controller?.postMessage({ type: 'process-sync-queue' });
        }
    } catch {
        // ignore
    }
}
// #endregion