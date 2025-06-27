import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeStorage } from './NativeStorage';
import { NotFoundError, ParseError } from '$lib/Errors';
import { Filesystem } from '@capacitor/filesystem';
import type { TestIStorageImplementation } from './IStorage.test';
import type { IStorage } from './types';

vi.mock("@capacitor/filesystem");
vi.mock("@capacitor-community/sqlite");
const fsMock = vi.mocked(Filesystem);

export const NativeIStorageTest: TestIStorageImplementation<NativeStorage> = {
    name: "Native",
    getInstance: async () => {
        return await NativeStorage.get('');
    },
    beforeeach: async (storage: IStorage) => {
        // @ts-expect-error
        fsMock.__reset && fsMock.__reset();

        fsMock.writeFile.mockClear();
        fsMock.readFile.mockClear();
        fsMock.deleteFile.mockClear();
    },
}

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

// describe("Integration", () => { });