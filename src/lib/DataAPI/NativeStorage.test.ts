import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeStorage } from './NativeStorage';
import { NotFoundError, ParseError } from '$lib/Errors';
import { Filesystem } from '@capacitor/filesystem';
import { SQLiteConnection } from '@capacitor-community/sqlite';
import type { TaskData } from './TaskData';

vi.mock("@capacitor/filesystem");
vi.mock("@capacitor-community/sqlite");
const fsMock = vi.mocked(Filesystem);

function sampleTask(id: string): TaskData {
    return {
        id,
        filepath: `${id}.md`,
        title: `Task ${id}`,
        content: 'Sample content',
        created: new Date().toISOString(),
        lastEdit: new Date().toISOString(),
    };
}

let _id = 0;
const idnext = () => { _id++; return _id.toString(); }

describe("Unit", () => {
    let storage: NativeStorage;

    beforeEach(async () => {
        // Reset all mock calls before each test
        // @ts-expect-error
        fsMock.__reset && fsMock.__reset();

        fsMock.writeFile.mockClear();
        fsMock.readFile.mockClear();
        fsMock.deleteFile.mockClear();
        storage = await NativeStorage.get('vault');
    });

    it('should create a node and update index', async () => {
        const taskData = sampleTask(idnext());
        const result = await storage.createNode(taskData);
        expect(result).toBeOk();
        expect(fsMock.writeFile).toHaveBeenCalled();
    });

    it('should read a node from the database', async () => {
        const taskData = sampleTask(idnext());
        const createRes = await storage.createNode(taskData);
        expect(createRes).toBeOk();
        const id = createRes._unsafeUnwrap();

        const result = await storage.readNode(id);
        expect(result).toBeOk();
        expect(result._unsafeUnwrap().id).toBe(id);
    });

    it('should return NotFoundError for missing node', async () => {
        const result = await storage.readNode('missing');
        expect(result).toErr();
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
    });

    it('should update a node', async () => {
        const taskData = sampleTask(idnext());
        const createRes = await storage.createNode(taskData);
        expect(createRes).toBeOk();
        const id = createRes._unsafeUnwrap();

        const result = await storage.updateNode(id, { title: 'Updated' });
        expect(result).toBeOk();
        expect(fsMock.writeFile).toHaveBeenCalled();
    });

    it('should delete a node', async () => {
        const taskData = sampleTask(idnext());
        const createRes = await storage.createNode(taskData);
        expect(createRes).toBeOk();
        const id = createRes._unsafeUnwrap();

        const result = await storage.deleteNode(id);
        expect(result).toBeOk();
        expect(fsMock.deleteFile).toHaveBeenCalled();
    });

    it('should handle updateIndexFromFile with parse error', async () => {
        // Override the mock for this test to simulate a parse error
        fsMock.readFile.mockResolvedValueOnce({ data: 'failparse' });
        const result = await storage.updateIndexFromFile('bad.md');
        expect(result).toErr();
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ParseError);
    });

    it('should handle updateIndexFromFile with missing file', async () => {
        // Override the mock for this test to simulate a missing file
        fsMock.readFile.mockRejectedValueOnce(new Error('File not found'));
        const result = await storage.updateIndexFromFile('missing.md');
        expect(result).toErr();
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
    });
});

describe("Integration", () => {});