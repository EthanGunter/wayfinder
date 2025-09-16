/// <reference lib="webworker" />
// SyncEngine (service worker)
import { openDB, type IDBPDatabase } from 'idb';
import { getRemoteProviders } from './lib/API/providerRegistry';
import { Err } from './lib/Errors';

declare let self: ServiceWorkerGlobalScope;

import type { SyncQueueEntry } from './lib/API/SyncQueue';
import { SYNC_DB_NAME, SYNC_STORE_NAME } from './lib/API/SyncQueue';
import { AUTH_SYNC_CHANNEL } from './lib/API/Auth/types';
import { TASKS_SYNC_CHANNEL } from './lib/API/Tasks';

let _dbPromise: Promise<IDBPDatabase<any>> | null = null;
function getDB() {
	if (!_dbPromise) {
		_dbPromise = openDB(SYNC_DB_NAME, 1, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
					const store = db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id', autoIncrement: true });
					(store as any).createIndex('by-createdAt', 'createdAt');
				}
			},
		});
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

async function takeNextBatch(limit = 20): Promise<SyncQueueEntry[]> {
	const db = await getDB();
	const tx = db.transaction(SYNC_STORE_NAME, 'readonly');
	const store = tx.store as any;
	const idx = store.index('by-createdAt');
	const cursor = await idx.openCursor();
	const batch: SyncQueueEntry[] = [];
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
	await db.delete(SYNC_STORE_NAME, id);
}

async function markFailed(id: number, error: any): Promise<void> {
	const db = await getDB();
	const item = await db.get(SYNC_STORE_NAME, id) as SyncQueueEntry | undefined;
	if (!item) return;
	item.tryCount += 1;

	const newError = formatErrorForLog(error);
	if (newError && !item.errors) item.errors = [];
	item.errors?.push(newError);

	await db.put(SYNC_STORE_NAME, item);
}

function formatErrorForLog(error: unknown): string {
	try {
		if (error instanceof Err) {
			return `${error.type}: ${error.message}`;
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

function toErr(error: unknown): Err {
	if (error instanceof Err) return error;
	if (error instanceof Error) return Err.wrap(error);
	return new Err(1, 'Unknown', typeof error === 'string' ? error : 'Non-Error thrown', error as any);
}

async function processQueue() {
	console.log("SW processing queue");

	let auth: any, tasks: any;
	try {
		({ auth, tasks } = await getRemoteProviders());
	} catch (e) {
		const wrapped = toErr(e).withTrace();
		wrapped.logError();
		return;
	}
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
			const wrapped = toErr(e).withTrace();
			wrapped.logError();
			await markFailed(entry.id!, wrapped);
			break;
		}
	}
}

self.addEventListener('sync', (event: any) => {
	console.log("SW sync:", event);

	if (event.tag === 'wayfinder-sync') {
		// event.waitUntil(processQueue());
	}
});

self.addEventListener('message', (event: any) => {
	console.log("SW message:", event);

	const { type } = event.data || {};
	if (type === 'process-sync-queue') {
		// event.waitUntil(processQueue());
	}
});