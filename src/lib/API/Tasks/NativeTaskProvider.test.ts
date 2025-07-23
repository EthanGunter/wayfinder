import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeTaskStorage as NativeTaskProvider } from './NativeTaskProvider';
import { NotFoundError, ParseError } from '$lib/Errors';
import { Filesystem } from '@capacitor/filesystem';
import type { TestIStorageImplementation as TestITaskProviderImplementation } from './ITaskProvider.test';
import type { ITaskAPI } from './types';

vi.mock("@capacitor/filesystem");
vi.mock("@capacitor-community/sqlite");
const fsMock = vi.mocked(Filesystem);

export const NativeITaskProviderTest: TestITaskProviderImplementation = {
    name: "Native",
    getInstance: async () => {
        return await NativeTaskProvider.get('');
    },
    beforeeach: async (storage: ITaskAPI) => {
        if ('__reset' in fsMock && typeof fsMock.__reset === 'function') {
            fsMock.__reset();
        }

        fsMock.writeFile.mockClear();
        fsMock.readFile.mockClear();
        fsMock.deleteFile.mockClear();
    },
}

describe("Unit", () => {
    let storage: NativeTaskProvider;

    beforeEach(async () => {
        // Reset all mock calls before each test
        // @ts-expect-error
        fsMock.__reset && fsMock.__reset();

        fsMock.writeFile.mockClear();
        fsMock.readFile.mockClear();
        fsMock.deleteFile.mockClear();
        storage = await NativeTaskProvider.get('vault');
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