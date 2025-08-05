import 'fake-indexeddb/auto'
import { describe, it, beforeEach, beforeAll, assert } from 'vitest';
import type { CreateTaskDTO, ITasks, ITasksLocal, TaskSyncQueue } from './types';
import { APP_TABLE_NAME, AUTH_TABLE_NAME, dbPromise, TASK_TABLE_NAME, type LocalDB } from '../localDB';
import BrowserTaskProvider from './BrowserTaskProvider';
import { mock, type MockProxy } from 'vitest-mock-extended';
import type { LocalUser } from '../Auth/types';


//#region Setup

let db: LocalDB;
let mockRemoteTasks: MockProxy<ITasks>;
let syncQueue: TaskSyncQueue | null;
let tasks: ITasksLocal;

const user1: LocalUser = {
  id: "User1",
  last_active: new Date(),
}
const user2: LocalUser = {
  id: "User2",
  last_active: new Date(),
}

function taskDetail(id?: string, userId?: string): CreateTaskDTO {
  return {
    id,
    title: `${userId} - Test Task`,
    user_id: userId ?? user1.id,
  }
}

beforeAll(async () => {
  db = await dbPromise;
});
beforeEach(async () => {
  mockRemoteTasks = mock<ITasks>();
  syncQueue = mock<TaskSyncQueue>();
  tasks = await BrowserTaskProvider.get(mockRemoteTasks);
  syncQueue = tasks.getSyncQueue();
  assert(!!syncQueue);

  if (db) {
    // Clear all stores before each test
    await db.clear(APP_TABLE_NAME);
    await db.clear(TASK_TABLE_NAME);
    await db.clear(AUTH_TABLE_NAME);
  } else throw new Error("DB not available to clear");
});

//#endregion


describe('ITaskCore', () => {
  // describe('createTask', () => { });
  describe('createTasks', () => { });
  // describe('getTask', () => { });
  describe('getTasks', () => { });
  describe('getAllUserTasks', () => { });
  // describe('updateTask', () => { });
  describe('updateTasks', () => { });
  // describe('deleteTask', () => { });
  describe('deleteTasks', () => { });
  describe('changeOwnership', () => { });
});

describe('ITaskRelations', () => {
  describe('getChildrenOf', () => { });
  describe('getParentsOf', () => { });
  describe('getRootTasks', () => { });
});

describe('ITaskAdvancedFeatures', () => {
  describe('getTodaysTasks', () => { });
  describe('getPrioritizedTasks', () => { });
  describe('searchTasks', () => { });
});

describe('ITaskExporter', () => {
  describe('exportData', () => { });
  describe('importData', () => { });
});





//#region legacy
/* export const BrowserITaskProviderTest: TestIStorageImplementation = {
  name: "Browser",
  getInstance: async () => {
    return await provider.get();
  },
  beforeeach: async (provider: ITasks) => {
    if (db) {
      // Clear all stores before each test
      await db.clear(APP_TABLE_NAME);
      await db.clear(TASK_TABLE_NAME);
      await db.clear(AUTH_TABLE_NAME);
    } else throw new Error("DB not available to clear");
  },
} */
//#endregion