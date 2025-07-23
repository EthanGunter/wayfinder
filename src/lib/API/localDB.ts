import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredUser } from "./Auth/types";
import type { Task, TaskData } from "./Tasks";

export const AUTH_TABLE_NAME = 'users';
export interface AuthDB extends DBSchema {
    users: {
        key: string;
        value: StoredUser,
        indexes: {
            'by-last-active': string;
        };
    };
}
export const TASK_TABLE_NAME = 'tasks';
export interface TaskDB extends DBSchema {
    // files: {
    //   key: string;
    //   value: { filepath: string; content: string };
    // };
    tasks: {
        key: string;
        value: TaskData;
        indexes: {
            'by-user': string,
            'by-parents': string,
            'by-children': string,
            'by-status': string,
            // 'todays-tasks': string // Can't store booleans, don't want to convert to number/string
        }
    };
}

const dbPromise = openDB<AuthDB & TaskDB>('wayfinder', 1, {
    upgrade(db, oldVer) {
        // Create users store if it doesn't exist
        if (!db.objectStoreNames.contains(AUTH_TABLE_NAME)) {
            const store = db.createObjectStore(AUTH_TABLE_NAME, { keyPath: 'id' });
            store.createIndex('by-last-active', 'last_active');
        }
        if (!db.objectStoreNames.contains(TASK_TABLE_NAME))        // db.createObjectStore('files', { keyPath: 'filepath' });
        {
            const store = db.createObjectStore(TASK_TABLE_NAME, { keyPath: 'id' });
            store.createIndex('by-user', 'user_id');
            store.createIndex('by-parents', 'parents');
            store.createIndex('by-children', 'children');
            store.createIndex('by-status', 'status');
        }
    },
});

export const authDBPromise = dbPromise as unknown as Promise<IDBPDatabase<AuthDB>>;
export const tasksDBPromise = dbPromise as unknown as Promise<IDBPDatabase<TaskDB>>;