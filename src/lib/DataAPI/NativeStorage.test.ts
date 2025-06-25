import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeStorage } from './NativeStorage';
import { NotFoundError, ParseError } from '$lib/Errors';
import { Filesystem } from '@capacitor/filesystem';
import { SQLiteConnection } from '@capacitor-community/sqlite';

vi.mock("@capacitor/filesystem");
vi.mock("@capacitor-community/sqlite");
const fsMock = vi.mocked(Filesystem);

describe('NativeStorage', () => {
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
        const result = await storage.createNode({ id: '1', filepath: '1.md', title: 'Test' });
        expect(result.isOk()).toBe(true);
        expect(fsMock.writeFile).toHaveBeenCalled();
    });

    it('should read a node from the database', async () => {
        await storage.createNode({ id: '1', filepath: '1.md', title: 'Test' });
        const result = await storage.readNode('1');
        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap().id).toBe('1');
    });

    it('should return NotFoundError for missing node', async () => {
        const result = await storage.readNode('missing');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
    });

    it('should update a node', async () => {
        await storage.createNode({ id: '1', filepath: '1.md', title: 'Test' });
        const result = await storage.updateNode('1', { title: 'Updated' });
        expect(result.isOk()).toBe(true);
        expect(fsMock.writeFile).toHaveBeenCalled();
    });

    it('should delete a node', async () => {
        await storage.createNode({ id: '1', filepath: '1.md', title: 'Test' });
        const result = await storage.deleteNode('1');
        expect(result.isOk()).toBe(true);
        expect(fsMock.deleteFile).toHaveBeenCalled();
    });

    it('should handle updateIndexFromFile with parse error', async () => {
        // Override the mock for this test to simulate a parse error
        fsMock.readFile.mockResolvedValueOnce({ data: 'failparse' });
        const result = await storage.updateIndexFromFile('bad.md');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ParseError);
    });

    it('should handle updateIndexFromFile with missing file', async () => {
        // Override the mock for this test to simulate a missing file
        fsMock.readFile.mockRejectedValueOnce(new Error('File not found'));
        const result = await storage.updateIndexFromFile('missing.md');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
    });
});