import taskProvider from './SupabaseTaskProvider';
import type { ITaskProvider } from './types';
import type { TestIStorageImplementation } from './ITaskProvider.test';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SupabaseITaskProviderTest: TestIStorageImplementation = {
  name: "Supabase",
  getInstance: async () => {
    return await taskProvider.get();
  },
  afterall: async (provider: ITaskProvider) => {
    // Clean up after tests
    const { client } = (provider as any as { client: SupabaseClient });
    await client.from('tasks').delete().not('id', 'is', null);
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
//     await client.from('tasks').delete().not('id', 'is', null);
//     await storage.close();
//   })
// });

// describe('Integration', () => { });
