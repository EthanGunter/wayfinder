import provider from './SupabaseTaskProvider';
import type { ITasks } from './types';
import type { TestIStorageImplementation } from './ITaskProvider.test';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SupabaseITaskProviderTest: TestIStorageImplementation = {
  name: "Supabase",
  getInstance: async () => {
    return await provider.init();
  },
  afterall: async (provider: ITasks) => {
    // Clean up after tests
    const { client } = (provider as any as { client: SupabaseClient });
    await client.from(TASK_STORE_NAME).delete().not('id', 'is', null);
    await provider.close();
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
//     await client.from(TASK_STORE_NAME).delete().not('id', 'is', null);
//     await storage.close();
//   })
// });

// describe('Integration', () => { });
