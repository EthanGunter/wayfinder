import { SupabaseTaskStorage } from './SupabaseTaskStorage';
import type { ITaskStorage } from './types';
import type { TestIStorageImplementation } from './IStorage.test';
import { afterAll, afterEach, beforeEach, describe } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SupabaseIStorageTest: TestIStorageImplementation<SupabaseTaskStorage> = {
  name: "Supabase",
  getInstance: async () => {
    return await SupabaseTaskStorage.get();
  },
  afterall: async (storage) => {
    // Clean up after tests
    const { client } = (storage as any as { client: SupabaseClient });
    await client.from('tasks').delete().not('id', 'is', null);
    await storage.close();
  }
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
