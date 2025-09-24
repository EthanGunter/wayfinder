import { Err, IOError, NotAuthorizedError, NotFoundError, NotImplementedError } from "$lib/Errors";
import { err, ok } from "neverthrow";
import type { ITasks, ITaskCore, ITaskRelations, ITaskAdvancedFeatures, CreateTaskParams, UpdateTaskParams } from "./types";
import { type Task, populateTaskDTO } from "./Task";
import supabase, { TASK_TABLE_NAME } from "../SupabaseClient";
import { okBatch, type IProvider } from "../types";
import type { Tables, TablesInsert } from "../supabase";
import { getRelationshipUpdates } from "./index";

// Fingerprint for correlating inserted rows to input details (order-independent)
// TODO:refactor This is ai-overkill for finding tasks that match between the client's optimistic creation, and the server's authoritative validation
function fingerprintTaskLike(t: { title?: string | null; content?: string | null; priority?: number | null; status?: number | null; parents?: string[] | null; children?: string[] | null; todays_task?: string | null; }): string {
  const title = t.title ?? '';
  const content = (t.content ?? '').trim();
  const priority = t.priority ?? 0;
  const status = t.status ?? 0;
  const parents = [...(t.parents ?? [])].sort();
  const children = [...(t.children ?? [])].sort();
  const todays = t.todays_task ?? '';
  return JSON.stringify({ title, content, priority, status, parents, children, todays });
}



const crud: ITaskCore = {
  createTask: async ({ createDetail }) => {
    const dto = populateTaskDTO(createDetail);
    // Server is authoritative for id: force id generation by stripping any client-provided id
    delete (dto as any).id;

    const { data, error } = await supabase.from(TASK_TABLE_NAME).insert([dto]).select('*').single();
    if (error || !data) {
      return err(new IOError(`Failed to create ${dto.title}`, error, dto));
    }

    return ok({ oldId: createDetail.id, newId: data.id });
  },

  createTasks: async ({ createDetails }) => {
    const dtos = createDetails.map((d) => {
      const dto = populateTaskDTO(d);
      // Server is authoritative for id: force id generation by stripping any client-provided id
      delete (dto as any).id;
      return dto;
    });

    const { data, error } = await supabase.from(TASK_TABLE_NAME).insert(dtos).select('*');
    if (error) {
      if (error.code === "42501") {
        return err(new NotAuthorizedError(`RLS policy failed for create task attempt: ${createDetails.map(t => t.title).join(', ')}`, error));
      } else {
        Err.UNHANDLED(error, `Failed to create tasks: ${createDetails.map(t => t.title).join(', ')}`);
      }
    }

    // Reorder the returned rows to align with the input details using fingerprints
    const buckets = new Map<string, Tables<'tasks'>[]>();
    for (const row of data as Tables<'tasks'>[]) {
      const key = fingerprintTaskLike(row);
      const arr = buckets.get(key) ?? [];
      arr.push(row);
      buckets.set(key, arr);
    }
    const ordered: Tables<'tasks'>[] = [];
    for (const dto of dtos) {
      const key = fingerprintTaskLike({
        title: dto.title,
        content: dto.content as any,
        priority: dto.priority as any,
        status: dto.status as any,
        parents: dto.parents as any,
        children: dto.children as any,
        todays_task: dto.todays_task as any,
      });
      const arr = buckets.get(key) ?? [];
      const row = arr.shift();
      if (row) ordered.push(row);
      if (arr.length > 0) buckets.set(key, arr); else buckets.delete(key);
    }

    /// TODO:DX:logging When fingerprint-based reordering fails (line 82), the code silently falls back to unordered data,
    // which could lead to incorrect ID mappings. Consider adding a warning log to help debug issues.
    const mapping = new Map<string, string>();
    const orderedRows = ordered.length === dtos.length ? ordered : (data as Tables<'tasks'>[]);
    for (let i = 0; i < createDetails.length && i < orderedRows.length; i++) {
      const maybeOldId = (createDetails as any)[i]?.id as string | undefined;
      if (maybeOldId) mapping.set(maybeOldId, orderedRows[i].id);
    }

    // Handle inverse relationship updates with real server IDs
    // Map created tasks to their real IDs for relationship processing
    const tasksWithRealIds: Task[] = orderedRows.map(row => ({
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
    }));

    // Calculate inverse relationship updates using real IDs
    const relationshipUpdates = await getRelationshipUpdates(api, tasksWithRealIds.map(newTask => ({ oldTask: null, newTask })));

    // Apply relationship updates to server using real IDs
    if (relationshipUpdates.length > 0) {
      await crud.updateTasks({ updates: relationshipUpdates });
    }

    return ok({ updatedIds: mapping });
  },

  getTask: async ({ id }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').eq('id', id).single();
    if (error || !data) {
      return err(new NotFoundError(id, 'Task'));
    }
    return ok(data);
  },

  getTasks: async ({ ids }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', ids);
    if (error) {
      return err(new IOError(`Failed to read tasks (${ids.join(', ')})`, error));
    }
    const foundIds = new Set((data ?? []).map((r: any) => r.id));
    const missing = ids.filter(id => !foundIds.has(id)).map(id => new NotFoundError(id, 'Task'));
    return okBatch((data ?? []), missing);
  },

  getAllUserTasks: async ({ userId }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').eq('user_id', userId);
    if (error) {
      return err(new IOError(`Failed to read tasks for user`, error, userId));
    }
    return okBatch((data ?? []));
  },

  updateTask: async (update: UpdateTaskParams) => {
    const batch = await crud.updateTasks({ updates: [update] });
    if (batch.isErr()) {
      return err(batch.error);
    }

    const { successes, errors } = batch.value;
    if (errors.length === 1) {
      return err(errors[0]);
    }

    return ok(successes[0]);
  },

  updateTasks: async ({ updates }) => {
    if (updates.length === 0) return okBatch([], []);
    const ids = updates.map(u => u.id);

    const existingRes = await supabase.from(TASK_TABLE_NAME).select('*').in('id', ids);
    if (existingRes.error) {
      return err(new IOError('Failed to read tasks for update', existingRes.error, ids));
    }

    const idToRow = new Map((existingRes.data ?? []).map((r: any) => [r.id, r] as [string, any]));

    const results: Task[] = [];
    const notFounds: NotFoundError[] = [];

    for (const u of updates) {
      const current = idToRow.get(u.id) as Task | undefined;
      if (!current) {
        notFounds.push(new NotFoundError(u.id, 'Task'));
        continue;
      }

      // Build the next state to compute relation array changes
      const next: Task = {
        id: current.id,
        user_id: current.user_id, // never change user_id in update path
        title: u.data?.title ?? current.title,
        content: u.data?.content ?? current.content,
        status: u.data?.status ?? current.status,
        todays_task: u.data?.todays_task ?? current.todays_task,
        priority: u.data?.priority ?? current.priority,
        parents: [...(current.parents ?? [])],
        children: [...(current.children ?? [])],
        created: current.created,
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

      // Build partial patch to avoid touching user_id and other immutable fields
      const patch: any = { last_edit: next.last_edit };
      if (u.data && 'title' in (u.data as any)) patch.title = next.title;
      if (u.data && 'content' in (u.data as any)) patch.content = next.content;
      if (u.data && 'status' in (u.data as any)) patch.status = next.status;
      if (u.data && 'todays_task' in (u.data as any)) patch.todays_task = next.todays_task;
      if (u.data && 'priority' in (u.data as any)) patch.priority = next.priority;
      if ((u.relations ?? []).length > 0) {
        patch.parents = next.parents ?? [];
        patch.children = next.children ?? [];
      }

      const { data, error } = await supabase
        .from(TASK_TABLE_NAME)
        .update(patch)
        .eq('id', u.id)
        .eq('user_id', current.user_id)
        .select('*')
        .single();

      if (error || !data) {
        // If update failed due to RLS or other error, surface as IO error
        return err(new IOError(`Failed to update task ${u.id}`, error, patch));
      }

      results.push(data as Task);
    }

    return okBatch(results, notFounds);
  },

  deleteTask: async ({ id }) => {
    const res = await supabase.from(TASK_TABLE_NAME).delete().eq('id', id).select('*').single();
    if (res.error) {
      return err(new IOError(`Failed to delete ${id}`, res.error));
    }
    if (!res.data) {
      return err(new NotFoundError(id, 'Task'));
    }
    return ok();
  },

  deleteTasks: async ({ ids }) => {
    // Server-side: just delete the specific IDs provided (client handles recursion)
    if (ids.length === 0) return ok();

    const res = await supabase.from(TASK_TABLE_NAME).delete().in('id', ids).select('*');
    if (res.error) {
      return err(new IOError(`Failed to delete ${ids.join(', ')}`, res.error));
    }
    return ok();
  },

  changeOwnership: async ({ oldUserID, newUserID }) => {
    const { data: toChange, error: readErr } = await supabase.from(TASK_TABLE_NAME).select('*').eq('user_id', oldUserID);
    if (readErr) {
      return err(new IOError('Failed to read tasks for ownership change', readErr, oldUserID));
    }
    if (!toChange || toChange.length === 0) return okBatch([]);
    const { data, error } = await supabase
      .from(TASK_TABLE_NAME)
      .update({ user_id: newUserID, last_edit: new Date().toISOString() })
      .eq('user_id', oldUserID)
      .select('*');
    if (error || !data) {
      return err(new IOError('Failed to change ownership', error));
    }
    return okBatch(data);
  },
};

const relations: ITaskRelations = {
  getChildrenOf: async ({ id }) => {
    const parent = await crud.getTask({ id });
    if (parent.isErr()) {
      return err(parent.error);
    }
    const childIds = parent.value.children ?? [];
    if (childIds.length === 0) return ok([]);

    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', childIds);
    if (error) {
      return err(new IOError(`Failed to find children for ${parent.value.title}`, error, childIds));
    }
    return ok(data ?? []);
  },
  getParentsOf: async ({ id }) => {
    const child = await crud.getTask({ id });
    if (child.isErr()) {
      return err(child.error);
    }
    const parentIds = child.value.parents ?? [];
    if (parentIds.length === 0) return ok([]);
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', parentIds);
    if (error) {
      return err(new IOError(`Failed to find parents for ${child.value.title}`, error, parentIds));
    }
    return ok(data ?? []);
  },
  getRootTasks: async () => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').or('parents.is.null,parents.eq.{}');
    if (error) {
      return err(new IOError('Failed to fetch roots', error));
    }
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
    if (error) {
      return err(new IOError(`Failed to fetch today's tasks`, error));
    }
    return ok((data ?? []));
  },
  getPrioritizedTasks: async (limit: number) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*');
    if (error) {
      return err(new IOError('Failed to fetch tasks for prioritization', error));
    }
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
  // TODO:sync/tasks/refactor Another example of remote-local API drift...
  subscribeTasks: function () {
    Err.UNHANDLED(new NotImplementedError('SupabaseTaskProvider.subscribeTasks'));
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