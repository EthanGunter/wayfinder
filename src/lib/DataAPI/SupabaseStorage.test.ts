import { SupabaseStorage } from './SupabaseStorage';
import type { IStorage } from './types';
import type { TestIStorageImplementation } from './IStorage.test';
import { afterAll, afterEach, beforeEach, describe } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SupabaseIStorageTest: TestIStorageImplementation<SupabaseStorage> = {
  name: "Supabase",
  getInstance: async () => {
    return await SupabaseStorage.get();
  },
  beforeeach: async (storage: IStorage) => {
    // Clear all stores before each test
    const db = await (storage as any).dbPromise;
    await db.clear('files');
    await db.clear('index');
  },
}

// describe('Unit', () => {
//   let storage: SupabaseStorage;

//   beforeEach(async () => {
//     storage = await SupabaseStorage.get();
//   });
//   afterEach(async () => {
//     await storage.close();
//   });

//   afterAll(async () => {
//     // Clean up after tests
//     const { client } = (storage as any as { client: SupabaseClient });
//     await client.from('tasks').delete().not('id', 'is', null);
//     await storage.close();
//   })
// });

// describe('Integration', () => { });
