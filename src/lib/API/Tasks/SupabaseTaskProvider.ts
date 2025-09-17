import { Err, IOError, NotFoundError, NotImplementedError } from "$lib/Errors";
import { err, ok } from "neverthrow";
import type { ITasks, ITaskCore, ITaskRelations, ITaskAdvancedFeatures, CreateTaskParams, UpdateTaskParams, DeleteTaskParams } from "./types";
import { type Task, populateTaskDTO } from "./Task";
import supabase, { TASK_TABLE_NAME } from "../SupabaseClient";
import { okBatch, type IProvider } from "../types";
import type { Tables, TablesInsert } from "../supabase";

// Helpers to map between DB row and app Task shape
function mapRowToTask(row: Tables<'tasks'>): Task {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    content: row.content ?? undefined,
    status: row.status,
    todays_task: row.todays_task,
    priority: row.priority ?? 0,
    parents: row.parents ?? [],
    children: row.children ?? [],
    created: row.created,
    last_edit: row.last_edit,
  };
}

function mapTaskToInsert(dto: Partial<Task>): TablesInsert<'tasks'> {
  return {
    id: dto.id,
    user_id: dto.user_id,
    title: dto.title!,
    content: dto.content,
    status: dto.status,
    todays_task: dto.todays_task,
    priority: dto.priority,
    parents: dto.parents ?? [],
    children: dto.children ?? [],
    created: dto.created,
    last_edit: dto.last_edit,
  } as TablesInsert<'tasks'>;
}

// No separate Update mapping; we use Insert shape for upsert to satisfy required fields

const crud: ITaskCore = {
  createTask: async ({ createDetail }) => {
    const dto = populateTaskDTO(createDetail);
    const { data, error } = await supabase.from(TASK_TABLE_NAME).insert([dto]).select('*').single();
    if (error || !data) return err(new IOError(`Failed to create ${dto.title}`, error, dto));
    return ok(data);
  },

  createTasks: async ({ createDetails }) => {
    const dtos = createDetails.map(populateTaskDTO);
    const { data, error } = await supabase.from(TASK_TABLE_NAME).insert(dtos).select('*');
    if (error || !data) return err(new IOError(`Failed to create ${createDetails.map(t => t.title).join(', ')}`, error, dtos));
    return okBatch(data);
  },

  getTask: async ({ id }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').eq('id', id).single();
    if (error || !data) return err(new NotFoundError(id, 'Task'));
    return ok(data);
  },

  getTasks: async ({ ids }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', ids);
    if (error) return err(new IOError(`Failed to read tasks (${ids.join(', ')})`, error));
    const foundIds = new Set((data ?? []).map((r: any) => r.id));
    const missing = ids.filter(id => !foundIds.has(id)).map(id => new NotFoundError(id, 'Task'));
    return okBatch((data ?? []), missing);
  },

  getAllUserTasks: async ({ userId }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').eq('user_id', userId);
    if (error) return err(new IOError(`Failed to read tasks for user`, error, userId));
    return okBatch((data ?? []));
  },

  updateTask: async (update: UpdateTaskParams) => {
    const batch = await crud.updateTasks({ updates: [update] });
    if (batch.isErr()) return err(batch.error);
    const [items, errors] = [batch.value[0], batch.value[1]] as any; // BatchResult tuple
    if (errors && errors.length) return err(errors[0]);
    return ok(items[0]);
  },

  updateTasks: async ({ updates }) => {
    if (updates.length === 0) return okBatch([], []);
    const ids = updates.map(u => u.id);
    const existingRes = await supabase.from(TASK_TABLE_NAME).select('*').in('id', ids);
    if (existingRes.error) return err(new IOError('Failed to read tasks for update', existingRes.error, ids));
    const idToRow = new Map((existingRes.data ?? []).map((r: any) => [r.id, r] as [string, any]));

    const rowsToUpsert: TablesInsert<'tasks'>[] = updates.map(u => {
      const current = idToRow.get(u.id);
      const next: Task = {
        id: u.id,
        user_id: (u.data?.user_id ?? current?.user_id)!,
        title: u.data?.title ?? current?.title ?? '',
        content: u.data?.content ?? current?.content,
        status: u.data?.status ?? current?.status ?? 0,
        todays_task: u.data?.todays_task ?? current?.todays_task,
        priority: u.data?.priority ?? current?.priority ?? 0,
        parents: [...(current?.parents ?? [])],
        children: [...(current?.children ?? [])],
        created: current?.created ?? new Date().toISOString(),
        last_edit: new Date().toISOString(),
      };

      for (const rel of u.relations ?? []) {
        switch (rel.operation) {
          case 'addChild': if (!next.children.includes(rel.id)) next.children.push(rel.id); break;
          case 'removeChild': next.children = next.children.filter(id => id !== rel.id); break;
          case 'addParent': if (!next.parents.includes(rel.id)) next.parents.push(rel.id); break;
          case 'removeParent': next.parents = next.parents.filter(id => id !== rel.id); break;
        }
      }

      // Ensure required arrays exist for DB types
      if (!next.parents) next.parents = [];
      if (!next.children) next.children = [];
      return next;
    });

    const { data, error } = await supabase.from(TASK_TABLE_NAME).upsert(rowsToUpsert).select('*');
    if (error || !data) return err(new IOError('Failed to update tasks', error, updates));
    return okBatch(data);
  },

  deleteTask: async ({ id }: DeleteTaskParams) => {
    const res = await supabase.from(TASK_TABLE_NAME).delete().eq('id', id).select('*').single();
    if (res.error) return err(new IOError(`Failed to delete ${id}`, res.error));
    if (!res.data) return err(new NotFoundError(id, 'Task'));
    return ok();
  },

  deleteTasks: async ({ deleteArgs }) => {
    // TODO:tasks/crud Delete doesn't take recursion into account...
    const ids = deleteArgs.map(d => d.id);
    const res = await supabase.from(TASK_TABLE_NAME).delete().in('id', ids).select('*');
    if (res.error) return err(new IOError(`Failed to delete ${ids.join(', ')}`, res.error));
    return ok();
  },

  changeOwnership: async ({ oldUserID, newUserID }) => {
    const { data: toChange, error: readErr } = await supabase.from(TASK_TABLE_NAME).select('*').eq('user_id', oldUserID);
    if (readErr) return err(new IOError('Failed to read tasks for ownership change', readErr, oldUserID));
    if (!toChange || toChange.length === 0) return okBatch([]);
    const { data, error } = await supabase
      .from(TASK_TABLE_NAME)
      .update({ user_id: newUserID, last_edit: new Date().toISOString() })
      .eq('user_id', oldUserID)
      .select('*');
    if (error || !data) return err(new IOError('Failed to change ownership', error));
    return okBatch(data);
  },
};

const relations: ITaskRelations = {
  getChildrenOf: async ({ id }) => {
    const parent = await crud.getTask({ id });
    if (parent.isErr()) return err(parent.error);
    const childIds = parent.value.children ?? [];
    if (childIds.length === 0) return ok([]);
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', childIds);
    if (error) return err(new IOError(`Failed to find children for ${parent.value.title}`, error, childIds));
    return ok(data ?? []);
  },
  getParentsOf: async ({ id }) => {
    const child = await crud.getTask({ id });
    if (child.isErr()) return err(child.error);
    const parentIds = child.value.parents ?? [];
    if (parentIds.length === 0) return ok([]);
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', parentIds);
    if (error) return err(new IOError(`Failed to find parents for ${child.value.title}`, error, parentIds));
    return ok(data ?? []);
  },
  getRootTasks: async () => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').or('parents.is.null,parents.eq.{}');
    if (error) return err(new IOError('Failed to fetch roots', error));
    return ok(data ?? []);
  },
};

const advanced: ITaskAdvancedFeatures = {
  getTodaysTasks: async () => {
    // Mirror Browser logic: tasks for the current user whose todays_task falls within [start, nextStart) UTC
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user?.id) {
      return ok([]);
    }
    const userId = userRes.user.id;

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();

    const { data, error } = await supabase
      .from(TASK_TABLE_NAME)
      .select('*')
      .eq('user_id', userId)
      .gte('todays_task', start)
      .lt('todays_task', next);
    if (error) return err(new IOError(`Failed to fetch today's tasks`, error));
    return ok((data ?? []));
  },
  getPrioritizedTasks: async (limit: number) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*');
    if (error) return err(new IOError('Failed to fetch tasks for prioritization', error));
    const tasks = (data ?? []);
    const roots = tasks.filter(t => (t.parents?.length ?? 0) === 0);
    const tasksMap = new Map(tasks.map(t => [t.id, t] as [string, Task]));
    const sorter = (a?: Task, b?: Task) => {
      if (!a) return -1; if (!b) return 1; return (b.priority ?? 0) - (a.priority ?? 0);
    };
    const todo: Task[] = [];
    const walk = (task: Task) => {
      if (todo.length === limit) return;
      if ((task.children?.length ?? 0) === 0) {
        if (task.status === 0) todo.push(task);
      } else {
        const children = task.children.map(id => tasksMap.get(id)).sort(sorter);
        for (const c of children) { if (c && c.status === 0) walk(c); }
        if (children.every(c => !c || c.status !== 0) && task.status === 0) todo.push(task);
      }
    };
    roots.sort(sorter); for (const r of roots) { if (todo.length === limit) break; walk(r); }
    return ok(todo);
  },
  searchTasks: async () => {
    Err.throw(new NotImplementedError('SupabaseTaskProvider.searchTasks'));
  },
  subscribeTasks: function () {
    // Remote subscribe not supported in Option A
    Err.UNHANDLED(new NotImplementedError('SupabaseTaskProvider.subscribeTasks'));
    return () => { };
  },
};

const api: ITasks = { ...crud, ...relations, ...advanced };

async function verifyConnectivity(): Promise<void> {
  try {
    const probe = await supabase.from(TASK_TABLE_NAME).select('id').limit(1);
    if (probe.error) {
      throw probe.error;
    }
  } catch (e) {
    throw new IOError('Supabase connectivity check failed', e);
  }
}

const SupabaseTaskProvider: IProvider<ITasks> = {
  get: async () => {
    // await verifyConnectivity();
    return api;
  },
};

export default SupabaseTaskProvider;