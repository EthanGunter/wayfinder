import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Task } from "./Tasks";
import type { LocalUser } from "./Auth/User";
import { TASK_TABLE_NAME, USER_TABLE_NAME } from "./DBConstants";

interface AuthDB extends DBSchema {
    users: {
        key: string;
        value: LocalUser
    };
}

interface TaskDB extends DBSchema {
    // files: {
    //   key: string;
    //   value: { filepath: string; content: string };
    // };
    tasks: {
        key: string;
        value: Task;
        indexes: {
            'by-user': string,
            'by-parents': string,
            'by-children': string,
            'by-status': string,
            // 'todays-tasks': string // Can't store booleans, don't want to convert to number/string
        }
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

export const dbPromise = openDB<AppDB & AuthDB & TaskDB>('wayfinder', 1, {
    upgrade(db, oldVer) {
        if (!db.objectStoreNames.contains(USER_TABLE_NAME)) {
            const store = db.createObjectStore(USER_TABLE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(TASK_TABLE_NAME)) {
            const store = db.createObjectStore(TASK_TABLE_NAME, { keyPath: 'id' });
            store.createIndex('by-user', 'user_id');
            store.createIndex('by-parents', 'parents');
            store.createIndex('by-children', 'children');
            store.createIndex('by-status', 'status');
        }

        if (!db.objectStoreNames.contains(APP_TABLE_NAME)) {
            const store = db.createObjectStore(APP_TABLE_NAME);
        }
    },
}) as unknown as Promise<LocalDB>;

export type LocalDB = IDBPDatabase<AppDB & AuthDB & TaskDB>;