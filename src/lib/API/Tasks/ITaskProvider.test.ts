import { describe, it, expect, beforeEach, afterEach, afterAll, test } from 'vitest';
import { NotFoundError } from '$lib/Errors';
import type { ITaskProvider } from './types';
import { BrowserITaskProviderTest } from './BrowserTaskProvider.test';
// import { NativeITaskProviderTest } from './NativeTaskProvider.test';
// import { SupabaseITaskProviderTest } from './SupabaseTaskProvider.test';
import { v4 } from 'uuid';

export interface TestIStorageImplementation {
    name: string,
    getInstance: () => Promise<ITaskProvider>,
    // beforeall?: (implementation: T) => Promise<void>,
    beforeeach?: (implementation: ITaskProvider) => Promise<void>,
    aftereach?: (implementation: ITaskProvider) => Promise<void>,
    afterall?: (implementation: ITaskProvider) => Promise<void>
}

const storageImplementations: TestIStorageImplementation[] = [
    BrowserITaskProviderTest,
    // NativeITaskProviderTest,
    // SupabaseITaskProviderTest
];


for (const { name, getInstance, ...vitefn } of storageImplementations) {
    describe(`${name} IStorage compliance`, () => {
        //#region Setup
        let provider: ITaskProvider;

        async function createSampleTask(title: string): Promise<string> {
            const createData = {
                filepath: `${title}.md`,
                title,
                content: 'Sample content',
            };
            const createResult = await provider.createTask(createData);
            expect(createResult).toBeOk();
            expect(typeof createResult._unsafeUnwrap()).toBe('string');

            return createResult._unsafeUnwrap();
        }

        beforeEach(async () => {
            provider = await getInstance();
            await vitefn.beforeeach?.(provider);
        });

        afterEach(async () => { await vitefn.aftereach?.(provider); provider.close() });

        afterAll(async () => { await vitefn.afterall?.(provider); });
        //#endregion


        //#region Tests
        it('should create a task', async () => {
            await createSampleTask("should create a task");
        });

        it('should create a task with relationships', async () => {
            // Create 2 tasks with no relationships
            const task1Id = await createSampleTask('Task 1');
            const task2Id = await createSampleTask('Task 2');

            // Create a task with the first task as a child and the second task as a parent
            const createData = {
                filepath: 'Task with relationships.md',
                title: 'Task with relationships',
                content: 'Task that depends on Task 1 and blocks Task 2',
                dependsOn: [task1Id],
                parent: task2Id
            };

            const createResult = await provider.createTask(createData);
            expect(createResult).toBeOk();
            const task3Id = createResult._unsafeUnwrap();

            // Verify the task was created with the correct relationships
            const readResult = await provider.readTask(task3Id);
            expect(readResult).toBeOk();

            const task = readResult._unsafeUnwrap();
            expect(task.children).toEqual([task1Id]);
            expect(task.parents).toBe(task2Id);

            // Verify we can retrieve children and parents
            const childrenResult = await provider.getChildrenOf(task3Id);
            expect(childrenResult).toBeOk();
            const children = childrenResult._unsafeUnwrap();
            expect(children).toHaveLength(1);
            expect(children[0].id).toBe(task1Id);

            const parentsResult = await provider.getParentsOf(task3Id);
            expect(parentsResult).toBeOk();
            const parents = parentsResult._unsafeUnwrap();
            expect(parents).toHaveLength(1);
            expect(parents[0].id).toBe(task2Id);
        })

        it('should read a task', async () => {
            const createData = {
                filepath: `should read a task.md`,
                title: "should read a task",
                content: 'Sample content',
            };
            const createResult = await provider.createTask(createData);
            expect(createResult).toBeOk();

            const readResult = await provider.readTask(createResult._unsafeUnwrap());
            expect(readResult).toBeOk();

            const task = readResult._unsafeUnwrap();
            expect(task).toMatchObject(createData);
        });

        it('should return NotFoundError for missing task', async () => {
            const readResult = await provider.readTask('missing');
            expect(readResult).toErr();
            expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
        });

        it('should update a task', async () => {
            // TODO Update needs to test *every single property*, including relationships
            const id = await createSampleTask('should update a task');
            const updateResult = await provider.updateTask(id, { title: 'Updated Title' });
            expect(updateResult).toBeOk();

            const readResult = await provider.readTask(id);
            expect(readResult).toBeOk();
            expect(readResult._unsafeUnwrap().title).toBe('Updated Title');
        });

        it('should delete a task', async () => {
            const id = await createSampleTask('should delete a task');

            const deleteResult = await provider.deleteTask(id);
            expect(deleteResult).toBeOk();

            const readResult = await provider.readTask(id);
            expect(readResult).toErr();
            const error = readResult._unsafeUnwrapErr();
            expect(error).toBeInstanceOf(NotFoundError);
        });

        test('deleteTask should succeed even if task does not exist', async () => {
            const deleteResult = await provider.deleteTask(v4()); // Generate a random uuid since supabase expects a uuid-v4 argument
            expect(deleteResult).toBeOk();
        });

        it('should close the storage without error', async () => {
            await expect(provider.close()).resolves.not.toThrow();
        });

        //#endregion
    });
}