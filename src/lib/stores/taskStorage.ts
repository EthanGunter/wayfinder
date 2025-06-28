import { writable } from 'svelte/store';
import { BrowserTaskStorage } from '$lib/DataAPI/BrowserTaskStorage';
import type { ITaskStorage } from '$lib/DataAPI/types';
import type { Task, TaskData } from '$lib/DataAPI/Task';

// Create a store for the storage instance
const createTaskStorageStore = () => {
	let storageInstance: ITaskStorage | null = null;

	const { subscribe, set, update } = writable<ITaskStorage | null>(null);

	return {
		subscribe,
		// Initialize the storage
		async init() {
			if (!storageInstance) {
				storageInstance = await BrowserTaskStorage.get();
				set(storageInstance);
			}
			return storageInstance;
		},
		// Get the current storage instance
		async getStorage(): Promise<ITaskStorage> {
			if (!storageInstance) {
				await this.init();
			}
			return storageInstance!;
		}
	};
};

export const taskStorage = createTaskStorageStore();

// Convenience functions for common operations
export async function deleteTask(id: string, recursive: boolean = false) {
	const storage = await taskStorage.getStorage();
	return await storage.deleteTask(id, recursive);
}

export async function updateTask(id: string, updates: Partial<TaskData>) {
	const storage = await taskStorage.getStorage();
	return await storage.updateTask(id, updates);
}

export async function createTask(taskData: TaskData) {
	const storage = await taskStorage.getStorage();
	return await storage.createTask(taskData);
}

export async function readTask(id: string) {
	const storage = await taskStorage.getStorage();
	return await storage.readTask(id);
}

export async function searchTasks(query: string): Promise<Task[]> {
	const storage = await taskStorage.getStorage();
	// TODO: Implement search functionality in storage
	// For now, return empty array
	return [];
}