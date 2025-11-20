import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { USER_TABLE_NAME } from "./DBConstants";
import type { SessionUser } from "$domain/models/user";

interface AuthDB extends DBSchema {
    users: {
        key: string;
        value: SessionUser
    };
}

export const APP_TABLE_NAME = 'appdata';
export const ACTIVEUSER_NAME = 'active-user';
interface AppDB extends DBSchema {
    appdata: {
        key: string;
        value: string | boolean | undefined;
    };
}

export const dbPromise = openDB<AppDB & AuthDB>('wayfinder', 1, {
    upgrade(db, oldVer) {
        if (!db.objectStoreNames.contains(USER_TABLE_NAME)) {
            const store = db.createObjectStore(USER_TABLE_NAME, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(APP_TABLE_NAME)) {
            const store = db.createObjectStore(APP_TABLE_NAME);
        }
    },
}) as unknown as Promise<LocalDB>;

export type LocalDB = IDBPDatabase<AppDB & AuthDB>;