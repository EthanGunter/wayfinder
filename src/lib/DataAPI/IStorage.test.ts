import { describe, it, expect, beforeEach, afterEach, afterAll, test } from 'vitest';
import { NotFoundError } from '$lib/Errors';
import type { IStorage } from './types';
import { BrowserIStorageTest } from './BrowserStorage.test';
import { NativeIStorageTest } from './NativeStorage.test';
import { SupabaseIStorageTest } from './SupabaseStorage.test';
import { v4 } from 'uuid';

export interface TestIStorageImplementation<T extends IStorage> {
    name: string,
    getInstance: () => Promise<T>,
    // beforeall?: (implementation: T) => Promise<void>,
    beforeeach?: (implementation: T) => Promise<void>,
    aftereach?: (implementation: T) => Promise<void>,
    afterall?: (implementation: T) => Promise<void>
}

const storageImplementations: TestIStorageImplementation<any>[] = [
    BrowserIStorageTest,
    NativeIStorageTest,
    SupabaseIStorageTest
];


for (const { name, getInstance, ...vitefn } of storageImplementations) {
    describe(`${name} IStorage compliance`, () => {
        //#region Setup
        let storage: IStorage;

        async function createSampleTask(title: string): Promise<string> {
            const createData = {
                filepath: `${title}.md`,
                title,
                content: 'Sample content',
            };
            const createResult = await storage.createTask(createData);
            expect(createResult).toBeOk();
            expect(typeof createResult._unsafeUnwrap()).toBe('string');

            return createResult._unsafeUnwrap();
        }

        beforeEach(async () => {
            storage = await getInstance();
            vitefn.beforeeach?.(storage);
        });

        afterEach(async () => { await vitefn.aftereach?.(storage); });

        afterAll(async () => { await vitefn.afterall?.(storage); });
        //#endregion


        //#region Tests
        it('should create a task', async () => {
            createSampleTask("should create a task");
        });

        it('should read a task', async () => {
            const createData = {
                filepath: `should read a task.md`,
                title: "should read a task",
                content: 'Sample content',
            };
            const createResult = await storage.createTask(createData);
            expect(createResult).toBeOk();

            const readResult = await storage.readTask(createResult._unsafeUnwrap());
            expect(readResult).toBeOk();

            const task = readResult._unsafeUnwrap();
            expect(task).toMatchObject(createData);
        });

        it('should return NotFoundError for missing task', async () => {
            const readResult = await storage.readTask('missing');
            expect(readResult).toErr();
            expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
        });

        it('should update a task', async () => {
            const id = await createSampleTask('should update a task');
            const updateResult = await storage.updateTask(id, { title: 'Updated Title' });
            expect(updateResult).toBeOk();

            const readResult = await storage.readTask(id);
            expect(readResult).toBeOk();
            expect(readResult._unsafeUnwrap().title).toBe('Updated Title');
        });

        it('should delete a task', async () => {
            const id = await createSampleTask('should delete a task');

            const deleteResult = await storage.deleteTask(id);
            expect(deleteResult).toBeOk();

            const readResult = await storage.readTask(id);
            expect(readResult).toErr();
            const error = readResult._unsafeUnwrapErr();
            expect(error).toBeInstanceOf(NotFoundError);
        });

        test('deleteTask should succeed even if task does not exist', async () => {
            const deleteResult = await storage.deleteTask(v4()); // Generate a random uuid since supabase expects a uuid-v4 argument
            expect(deleteResult).toBeOk();
        });

        it('should close the storage without error', async () => {
            await expect(storage.close()).resolves.not.toThrow();
        });

        //#endregion
    });
}