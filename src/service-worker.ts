/// <reference lib="webworker" />
// SyncEngine (service worker)
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { getRemoteProviders } from './lib/API/providerRegistry';

declare let self: ServiceWorkerGlobalScope;

import type { DurableSyncQueueEntry } from './lib/API/SyncQueue';
import { DURABLE_DB_NAME, DURABLE_STORE_NAME } from './lib/API/SyncQueue';
import { AUTH_SYNC_CHANNEL } from './lib/API/Auth/types';
import { TASKS_SYNC_CHANNEL } from './lib/API/Tasks';

let _dbPromise: Promise<IDBPDatabase<any>> | null = null;
function getDB() {
	if (!_dbPromise) {
		_dbPromise = openDB(DURABLE_DB_NAME, 1);
	}
	return _dbPromise!;
}

self.addEventListener('install', () => {
	// keep SW lightweight; no precache yet
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

async function takeNextBatch(limit = 20): Promise<DurableSyncQueueEntry[]> {
	const db = await getDB();
	const tx = db.transaction(DURABLE_STORE_NAME, 'readonly');
	const store = tx.store as any;
	const idx = store.index('by-createdAt');
	const cursor = await idx.openCursor();
	const batch: DurableSyncQueueEntry[] = [];
	let cur = cursor;
	while (cur && batch.length < limit) {
		batch.push(cur.value);
		cur = await cur.continue();
	}
	await tx.done;
	return batch;
}

async function markDone(id: number): Promise<void> {
	const db = await getDB();
	await db.delete(DURABLE_STORE_NAME, id);
}

async function markFailed(id: number, error: any): Promise<void> {
	const db = await getDB();
	const item = await db.get(DURABLE_STORE_NAME, id) as DurableSyncQueueEntry | undefined;
	if (!item) return;
	item.tryCount += 1;

	const newError = typeof error === 'string' ? error : (error?.message ?? JSON.stringify(error));
	if (newError && !item.errors) item.errors = [];
	item.errors?.push(newError);

	await db.put(DURABLE_STORE_NAME, item);
}

async function processDurableQueue() {
	const { auth, tasks } = await getRemoteProviders();
	const batch = await takeNextBatch(50);
	for (const entry of batch) {
		try {
			switch (entry.channel) {
				case AUTH_SYNC_CHANNEL: {
					const fn = (auth as any)[entry.fnName];
					if (typeof fn !== 'function') throw new Error(`Auth function not found: ${entry.fnName}`);
					const res = await fn(entry.args);
					if (res?.isErr?.()) throw res.error;
					await markDone(entry.id!);
					break;
				}
				case TASKS_SYNC_CHANNEL: {
					const fn = (tasks as any)[entry.fnName];
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
			await markFailed(entry.id!, e);
			break;
		}
	}
}

self.addEventListener('sync', (event: any) => {
	if (event.tag === 'wayfinder-sync') {
		event.waitUntil(processDurableQueue());
	}
});

self.addEventListener('message', (event: any) => {
	const { type } = event.data || {};
	if (type === 'process-sync-queue') {
		event.waitUntil(processDurableQueue());
	}
});