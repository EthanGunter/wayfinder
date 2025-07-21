import { Err, IOError, NotFoundError, NotImplementedError } from "$lib/Errors";
import { SupabaseClient } from "@supabase/supabase-js";
import { Result, err, ok } from "neverthrow";
import type {
  IProvider,
  ITaskProvider,
  ITaskCRUDProvider,
  ITaskExporter,
  IAdvancedTaskProvider,
  ITaskRelationProvider,
  CreateTaskDTO,
  PopulatedTaskDTO
} from "./types";
import { isTask, Task, TaskStatus, type TaskData } from "./Task";
import supabase from "../SupabaseClient";
import { updateRelationships } from ".";
import { TASK_TABLE_NAME } from "../localDB";

let client = supabase;

const taskCRUD: ITaskCRUDProvider = {
  createTask: async function (createDetails: CreateTaskDTO): Promise<Result<Task, Err>> {
    const task = Task.populateDTO(createDetails);

    const { data, error } = await client.from(TASK_TABLE_NAME).insert([task]).select('*').single();
    if (error) return err(new IOError(`Failed to create ${createDetails.title}`, error, task));

    if (task.parents.length > 0 || task.children.length > 0) {
      updateRelationships(api, { oldTask: null, newTask: new Task({ id: data.id, ...task }) });
    }

    // Return the generated ID
    return ok(new Task(data));
  },

  createTasks: async function (createDetails: CreateTaskDTO[]): Promise<Result<Task[], Err>> {
    const tasks = createDetails.map(t => Task.populateDTO(t));

    const { data, error } = await client.from(TASK_TABLE_NAME).insert(tasks).select('*');
    if (error) return err(new IOError(`Failed to create ${createDetails.map(t => t.title).join(', ')}`, error, tasks));

    const updatesWithRelations = data.filter(t => t.parents.length > 0 || t.children.length > 0);

    updateRelationships(api, updatesWithRelations.map(task => ({ oldTask: null, newTask: new Task(task) })));

    // Return the generated ID
    return ok(data.map(t => new Task(t)));
  },
  readTask: async function (id: string): Promise<Result<Task, NotFoundError | Err>> {
    const { data, error } = await client.from(TASK_TABLE_NAME).select().eq('id', id).single();
    if (!data) return err(new NotFoundError(id, 'Task'));
    if (error) return err(new IOError(`Failed to read ${id}`, error));

    return ok(new Task(data));
  },

  readTasks: async function (ids: string[]): Promise<Result<Task[], NotFoundError | Err>> {
    const { data, error } = await client.from(TASK_TABLE_NAME).select().in('id', ids);
    if (!data || data.length == 0) return err(new NotFoundError(ids, TASK_TABLE_NAME));
    if (error) return err(new IOError(`Failed to read tasks (${ids.join(', ')})`, error));

    return ok(data.map(t => new Task(t)));
  },

  updateTask: async function (task: string | Task, updates: Partial<Task>): Promise<Result<Task, Err>> {
    // Convert the id to task
    if (typeof task === 'string') {
      const readRes = (await taskCRUD.readTask(task))
      if (readRes.isErr()) {
        return err(readRes.error);
      }
      task = readRes.value;
    }

    const { data, error } = await client
      .from(TASK_TABLE_NAME)
      .update({ ...updates, last_edit: new Date().toISOString() })
      .eq('id', task.id)
      .select()
      .single();
    if (error || !data) return err(new IOError(`Failed to update ${task.title}`, error, updates));

    updateRelationships(api, { oldTask: task, newTask: new Task(data) });

    return ok(new Task(data));
  },
  updateTasks: async function (updates: { task: string | Task, updates: Partial<Task> }[]): Promise<Result<Task[], Err>> {
    // First, normalize all tasks - convert string IDs to Task objects
    const stringIds = updates.filter(u => typeof u.task === 'string').map(u => u.task as string);
    let idToTask = new Map<string, Task>();

    if (stringIds.length > 0) {
      const readRes = await taskCRUD.readTasks(stringIds);
      if (readRes.isErr()) {
        return err(readRes.error);
      }
      idToTask = new Map(readRes.value.map(t => [t.id, t]));
    }

    // Normalize all updates to have Task objects
    const normalizedUpdates = updates.map(update => ({
      task: typeof update.task === 'string' ? idToTask.get(update.task)! : update.task,
      updates: update.updates
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
        updates
      ));
    }

    // Create Task instances from the returned data
    const updatedTasks = data.map(d => new Task(d));

    // Update relationships for all changed tasks
    const relationshipUpdates = normalizedUpdates.map((update, index) => ({
      oldTask: update.task,
      newTask: updatedTasks[index]
    }));

    await updateRelationships(api, relationshipUpdates);

    return ok(updatedTasks);
  },

  /**
   * @param recursive NOT IMPLEMENTED
   */
  deleteTask: async function (id: string, recursive?: boolean): Promise<Result<void, Err>> {
    if (recursive) throw new NotImplementedError("Recursive delete for SupabaseTaskProvider.deleteTask is not implemented yet");

    let deleteRes = await client.from(TASK_TABLE_NAME).delete().eq('id', id).select().single();
    if (deleteRes.error) return err(new IOError(`Failed to delete ${id}`, deleteRes.error));
    else if (deleteRes.count === 0) return err(new NotFoundError(id, 'task'));

    updateRelationships(api, { oldTask: new Task(deleteRes.data), newTask: null });

    return ok();
  },

  /**
   * @param recursive NOT IMPLEMENTED
   */
  deleteTasks: async function (list: { id: string, recursive?: boolean }[]): Promise<Result<void, Err>> {
    for (const item of list) {
      if (item.recursive) throw new NotImplementedError("Recursive delete for SupabaseTaskProvider.deleteTask is not implemented yet");
    }

    let deleteRes = await client.from(TASK_TABLE_NAME).delete().in('id', list.map(x => x.id)).select();
    if (deleteRes.error) return err(new IOError(`Failed to delete ${list.map(x => x.id).join(', ')}`, deleteRes.error));
    else if (deleteRes.count === 0) return err(new NotFoundError(list.map(x => x.id).join(', '), 'task'));

    updateRelationships(api, deleteRes.data.map(task => ({ oldTask: new Task(task), newTask: null })));

    return ok();
  },

  changeOwnership: async function (oldUserID: string, newUserID: string): Promise<Result<Task[], Err>> {
    const tasks = await client.from(TASK_TABLE_NAME).select().eq('user_id', oldUserID);
    if (tasks.error) {
      return err(Err.Wrap(tasks.error));
    }

    const convertedTasks = tasks.data.map(t => new Task({ ...t, user_id: newUserID }));
    taskCRUD.updateTasks(convertedTasks.map(t => ({ task: t, updates: t })));
    return ok(convertedTasks);
  },
}

const taskRelations: ITaskRelationProvider = {
  async getChildrenOf(task: string | Task): Promise<Result<Task[], Err>> {
    // First get the parent task to access its children array
    let parentTask: Task;
    if (typeof task === "string") {
      const parentResult = await taskCRUD.readTask(task);
      if (parentResult.isErr()) {
        return err(parentResult.error);
      } else parentTask = parentResult.value;
    } else parentTask = task;

    if (parentTask.children.length === 0) {
      return ok([]);
    }

    // Fetch only the specified child tasks
    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').in('id', parentTask.children);
    if (error) return err(new IOError(`Failed to find children for ${parentTask.title}`, error, parentTask.children));

    return ok(data.map(t => new Task(t)));
  },

  async getParentsOf(task: string | Task): Promise<Result<Task[], Err>> {
    let childTask: Task;

    if (typeof task === "string") {
      const childTaskResult = await taskCRUD.readTask(task);
      if (childTaskResult.isErr()) {
        return err(childTaskResult.error);
      } else childTask = childTaskResult.value;
    } else childTask = task;

    if (childTask.parents.length === 0) {
      return ok([]);
    }

    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').in('id', childTask.parents);
    if (error) return err(new IOError(`Failed to find parents for ${childTask.title}`, error, childTask.parents));

    return ok(data.map(t => new Task(t)));
  },

  async getRootTasks(): Promise<Result<Task[], Err>> {
    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').or('parents.is.null,parents.eq.{}');
    if (error) return err(new IOError(`Failed to fetch roots`, error));

    return ok(data.map(t => new Task(t)));
  }
}

const advancedFeatures: IAdvancedTaskProvider = {
  getTodaysTasks: async function (): Promise<Result<Task[], Err>> {
    const { data, error } = await client.from(TASK_TABLE_NAME).select('*').eq('todays_task', true);
    if (error) return err(new IOError(`Failed to fetch today's tasks`, error));

    return ok(data.map(t => new Task(t)));
  },

  // TODO Come up with a solution that saves us from fetching ALL nodes for sorting...
  getPrioritizedTasks: async function (limit: number): Promise<Result<Task[], Err>> {
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

  searchTasks: async function (searchTerm: string): Promise<Task[]> {
    throw new Error("Function not implemented.");
  }
}

const dataExporter: ITaskExporter = {
  exportData: function (simplify?: boolean): Promise<void> {
    throw new Error("Function not implemented.");
  },
  importData: function (data: string): Promise<number> {
    throw new Error("Function not implemented.");
  }
}

const api: ITaskProvider = { ...taskCRUD, ...taskRelations, ...advancedFeatures };

/** No-op for Supabase */
const SupabaseTaskProvider: IProvider<ITaskProvider> = {
  get: async function (): Promise<ITaskProvider> { return api; },
  close: async function (): Promise<void> { }
}

export default SupabaseTaskProvider;