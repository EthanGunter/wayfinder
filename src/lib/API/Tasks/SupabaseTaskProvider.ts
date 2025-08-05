import { Err, IOError, NotFoundError, NotImplementedError } from "$lib/Errors";
import { SupabaseClient } from "@supabase/supabase-js";
import { err, ok } from "neverthrow";
import type {
  ITasks,
  ITaskCore,
  ITaskExporter,
  ITaskAdvancedFeatures,
  ITaskRelations,
  CreateTaskParams,
  PopulatedTaskDTO
} from "./types";
import { isTask, Task, TaskStatus, type TaskData } from "./Task";
import supabase from "../SupabaseClient";
import { getRelationshipUpdates } from ".";
import { TASK_TABLE_NAME } from "../localDB";
import { extractBatch, extractBatchAndLogErrors, okBatch, type IProvider } from "../types";

let client = supabase;

const taskCRUD: ITaskCore = {
  createTask: async function ({ createDetail }) {
    const task = Task.populateDTO(createDetail);

    const { data, error } = await client.from(TASK_TABLE_NAME).insert([task]).select('*').single();
    if (error) return err(new IOError(`Failed to create ${createDetail.title}`, error, task));

    if (task.parents.length > 0 || task.children.length > 0) {
      getRelationshipUpdates(api, { oldTask: null, newTask: new Task({ id: data.id, ...task }) });
    }

    // Return the generated ID
    return ok(new Task(data));
  },

  createTasks: async function ({ createDetails }) {
    const tasks = createDetails.map(t => Task.populateDTO(t));

    const { data, error } = await client.from(TASK_TABLE_NAME).insert(tasks).select('*');
    if (error) return err(new IOError(`Failed to create ${createDetails.map(t => t.title).join(', ')}`, error, tasks));

    const updatesWithRelations = data.filter(t => t.parents.length > 0 || t.children.length > 0);

    getRelationshipUpdates(api, updatesWithRelations.map(task => ({ oldTask: null, newTask: new Task(task) })));

    // Return the generated ID
    return okBatch(data.map(t => new Task(t)));
  },
  getTask: async function ({ id }) {
    const { data, error } = await client.from(TASK_TABLE_NAME).select().eq('id', id).single();
    if (!data) return err(new NotFoundError(id, 'Task'));
    if (error) return err(new IOError(`Failed to read ${id}`, error));

    return ok(new Task(data));
  },

  getTasks: async function ({ ids }) {
    const { data, error } = await client.from(TASK_TABLE_NAME).select().in('id', ids);
    if (!data || data.length == 0) return err(new NotFoundError(`Failed to find ids in ${TASK_TABLE_NAME} table`, ids));
    if (error) return err(new IOError(`Failed to read tasks (${ids.join(', ')})`, error));

    return okBatch(data.map(t => new Task(t)));
  },
  getAllUserTasks(userId) {
    Err.throw(new NotImplementedError("SupabaseTaskProvider.getAllUserTasks"));
  },

  updateTask: async function ({ taskOrId, changes }) {
    // Convert the id to task
    if (typeof taskOrId === 'string') {
      const readRes = (await taskCRUD.getTask({ id: taskOrId }))
      if (readRes.isErr()) {
        return err(readRes.error);
      }
      taskOrId = readRes.value;
    }

    const { data, error } = await client
      .from(TASK_TABLE_NAME)
      .update({ ...changes, last_edit: new Date().toISOString() })
      .eq('id', taskOrId.id)
      .select()
      .single();
    if (error || !data) return err(new IOError(`Failed to update ${taskOrId.title}`, error, changes));

    getRelationshipUpdates(api, { oldTask: taskOrId, newTask: new Task(data) });

    return ok(new Task(data));
  },
  updateTasks: async function ({ updateList }) {
    // First, normalize all tasks - convert string IDs to Task objects
    const stringIds = updateList.filter(u => typeof u.taskOrId === 'string').map(u => u.taskOrId as string);
    let idToTask = new Map<string, Task>();

    if (stringIds.length > 0) {
      const readRes = await taskCRUD.getTasks({ ids: stringIds });
      if (readRes.isErr()) {
        return err(readRes.error);
      }
      const tasks = extractBatchAndLogErrors(readRes);
      idToTask = new Map(tasks.map(t => [t.id, t]));
    }

    // Normalize all updates to have Task objects
    const normalizedUpdates = updateList.map(update => ({
      task: typeof update.taskOrId === 'string' ? idToTask.get(update.taskOrId)! : update.taskOrId,
      updates: update.changes
    }));

    // Prepare the data for batch update
    const updateData = normalizedUpdates.map(({ task, updates }) => ({
      ...task, // Upsert requires ALL fields for the initial INSERT attempt... Only other option is iterated single .update() calls
      ...updates,
      last_edit: new Date().toISOString()
    }));

    // Perform batch update
    const { data, error } = await client
      .from(TASK_TABLE_NAME)
      .upsert(updateData)
      .select();

    if (error || !data || data.length === 0) {
      return err(new IOError(
        `Failed to update tasks: ${normalizedUpdates.map(u => u.task.title).join(', ')}`,
        error,
        updateList
      ));
    }

    // Create Task instances from the returned data
    const updatedTasks = data.map(d => new Task(d));

    // Update relationships for all changed tasks
    const relationshipUpdates = normalizedUpdates.map((update, index) => ({
      oldTask: update.task,
      newTask: updatedTasks[index]
    }));

    await getRelationshipUpdates(api, relationshipUpdates);

    return okBatch(updatedTasks);
  },

  /**
   * @param recursive NOT IMPLEMENTED
   */
  deleteTask: async function ({ id, recursive }) {
    if (recursive) Err.throw(new NotImplementedError("SupabaseTaskProvider.deleteTask(recursive=true)"));

    let deleteRes = await client.from(TASK_TABLE_NAME).delete().eq('id', id).select().single();
    if (deleteRes.error) return err(new IOError(`Failed to delete ${id}`, deleteRes.error));
    else if (deleteRes.count === 0) return err(new NotFoundError(id, 'task'));

    getRelationshipUpdates(api, { oldTask: new Task(deleteRes.data), newTask: null });

    return ok();
  },

  /**
   * @param recursive NOT IMPLEMENTED
   */
  deleteTasks: async function ({ deleteList }) {
    for (const item of deleteList) {
      if (item.recursive) Err.throw(new NotImplementedError("SupabaseTaskProvider.deleteTask(recursive=true)"));
    }

    let deleteRes = await client.from(TASK_TABLE_NAME).delete().in('id', deleteList.map(x => x.id)).select();
    if (deleteRes.error) return err(new IOError(`Failed to delete ${deleteList.map(x => x.id).join(', ')}`, deleteRes.error));
    else if (deleteRes.count === 0) return err(new NotFoundError(deleteList.map(x => x.id).join(', '), 'task'));

    getRelationshipUpdates(api, deleteRes.data.map(task => ({ oldTask: new Task(task), newTask: null })));

    return ok();
  },

  changeOwnership: async function ({ oldUserID, newUserID }) {
    const tasks = await client.from(TASK_TABLE_NAME).select().eq('user_id', oldUserID);
    if (tasks.error) {
      return err(Err.wrap(tasks.error));
    }

    const convertedTasks = tasks.data.map(t => new Task({ ...t, user_id: newUserID }));
    taskCRUD.updateTasks({ updateList: convertedTasks.map(t => ({ taskOrId: t, changes: t })) });
    return okBatch(convertedTasks);
  },
}

const taskRelations: ITaskRelations = {
  async getChildrenOf({ taskOrId }) {
    // First get the parent task to access its children array
    let parentTask: Task;
    if (typeof taskOrId === "string") {
      const parentResult = await taskCRUD.getTask({ id: taskOrId });
      if (parentResult.isErr()) {
        return err(parentResult.error);
      } else parentTask = parentResult.value;
    } else parentTask = taskOrId;

    if (parentTask.children.length === 0) {
      return ok([]);
    }

    // Fetch only the specified child tasks
    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').in('id', parentTask.children);
    if (error) return err(new IOError(`Failed to find children for ${parentTask.title}`, error, parentTask.children));

    return ok(data.map(t => new Task(t)));
  },

  async getParentsOf({ taskOrId }) {
    let childTask: Task;

    if (typeof taskOrId === "string") {
      const childTaskResult = await taskCRUD.getTask({ id: taskOrId });
      if (childTaskResult.isErr()) {
        return err(childTaskResult.error);
      } else childTask = childTaskResult.value;
    } else childTask = taskOrId;

    if (childTask.parents.length === 0) {
      return ok([]);
    }

    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').in('id', childTask.parents);
    if (error) return err(new IOError(`Failed to find parents for ${childTask.title}`, error, childTask.parents));

    return ok(data.map(t => new Task(t)));
  },

  async getRootTasks() {
    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').or('parents.is.null,parents.eq.{}');
    if (error) return err(new IOError(`Failed to fetch roots`, error));

    return ok(data.map(t => new Task(t)));
  }
}

const advancedFeatures: ITaskAdvancedFeatures = {
  getTodaysTasks: async function () {
    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').eq('todays_task', true);
    if (error) return err(new IOError(`Failed to fetch today's tasks`, error));

    return ok(data.map(t => new Task(t)));
  },

  // TODO Come up with a solution that saves us from fetching ALL nodes for sorting...
  getPrioritizedTasks: async function (limit) {
    // Fetch all tasks from Supabase
    const { data: taskArray, error } = await client.from(TASK_TABLE_NAME).select('*');
    if (error) return err(new IOError(`Failed to fetch tasks for prioritization`, error));
    if (!taskArray) return ok([]);

    // Convert raw data to Task instances
    const tasks: Task[] = taskArray.map(t => new Task(t));

    // Filter root tasks and create a map for quick lookups
    const roots: Task[] = tasks.filter(t => t.parents.length === 0);
    const tasksMap: Map<string, Task> = new Map(tasks.map(t => [t.id, t] as [string, Task]));

    // Sort function to order tasks by priority (highest first)
    const sorter = (a: Task | undefined, b: Task | undefined) => {
      if (!a) return -1;
      else if (!b) return 1;
      else return (b.priority ?? 0) - (a.priority ?? 0)
    };

    let todoList: Task[] = [];

    const inOrderTraversalAssignment = (task: Task) => {
      if (todoList.length === limit/*  || task.tags?.includes('disabled') */)
        return; // stop searching once all tasks are acquired

      // TODO this lil check right here may not be ideal... user testing will tell
      if (task.children.length === 0) { // is leaf node
        if (!task.completed) {// and it's not already completed
          todoList.push(task); // add to todolist
        }
      }
      else { // continue for all children, starting with highest priority
        const children: (Task | undefined)[] = task.children.map(child => tasksMap.get(child)).sort(sorter)
        for (const child of children) {
          if (!child) continue;

          if (!child.completed) {
            inOrderTraversalAssignment(child);
          }
        }

        // If all children are completed, add the parent task
        if (children.every(c => !c || c.completed) && !task.completed) {
          todoList.push(task);
        }
      }
    }

    // Sort root tasks by priority and traverse
    roots.sort(sorter)
    for (let i = 0; i < roots.length; i++) {
      if (todoList.length === limit)
        return ok(todoList);

      const root = roots[i];
      inOrderTraversalAssignment(root);
    }

    return ok(todoList);
  },

  searchTasks: async function (searchTerm) {
    Err.throw(new NotImplementedError('SupabaseTaskProvider.searchTasks'));
  }
}

const api: ITasks = { ...taskCRUD, ...taskRelations, ...advancedFeatures };

/** No-op for Supabase */
const SupabaseTaskProvider: IProvider<ITasks> = {
  get: async function () { return api; },
  // close: async function () { }
}

export default SupabaseTaskProvider;