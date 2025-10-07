import { Err, IOError, NotAuthorizedError, NotFoundError, NotImplementedError } from "$domain/errors";
import { err, ok } from "$domain/result";
import { type ITasks, type Task, type UpdateTaskParams, populateTaskDTO } from "$domain/models/task";
import { getRelationshipUpdates } from "./index";
import { settings, deviceSettingsReady } from "$lib/user-settings";
import { createClient } from "@supabase/supabase-js";
import { get } from "svelte/store";
import type { Database } from "../supabase";
import { TASK_TABLE_NAME } from "../DBConstants";

// TODO:bulk This provider uses sequential inserts to guarantee deterministic id mapping without fingerprints.
// For very large imports this is inefficient (O(N) round-trips).
// Consider:
//  - Option B: add a client_ref column to support single bulk insert mapping
//  - Option C: a Postgres RPC that accepts jsonb[] with client_ref and returns pairs
// Either alternative preserves authoritative ids while reducing network chatter.


//#region Supabase Connection

// await deviceSettingsReady;

const urlOverride = get(settings.dev.overrides.supabaseTaskUrl);
const keyOverride = get(settings.dev.overrides.supabaseTaskKey);
const supabaseUrl = urlOverride || import.meta.env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = keyOverride || import.meta.env?.VITE_SUPABASE_API_KEY || process.env.SUPABASE_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseKey) missing.push('SUPABASE_API_KEY');
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

//#endregion


const api: ITasks = {
  // TODO:test There's currently nothing that calls the remote's singular createTask, so I don't know if it works...
  createTask: async ({ createDetail }) => {
    // TODO:bulk Consider batching or RPC-based create for import scenarios; this is single-row for clarity.
    const full = populateTaskDTO(createDetail);
    const { id: _drop, ...dto } = full; // drop client-provided id; server is authoritative

    const { data: createdRow, error } = await supabase.from(TASK_TABLE_NAME).insert([dto]).select('*').single();
    if (error || !createdRow) {
      return err(new IOError(`[Supabase] Failed to create ${full.title}`, error, dto));
    }
    const createdTask = toTask(createdRow);

    // Compute relationship updates for this new task using real ID
    const relUpdates = await getRelationshipUpdates(api, { oldTask: null, newTask: createdTask });

    // Fix any self-references from temp ids in parents/children
    const mapping = new Map<string, string>();
    if (createDetail.id) mapping.set(createDetail.id, createdTask.id);

    const selfFixes: UpdateTaskParams[] = [];
    if ((createdTask.parents?.length ?? 0) > 0 || (createdTask.children?.length ?? 0) > 0) {
      const relOps: { id: string; operation: "addChild" | "removeChild" | "addParent" | "removeParent" }[] = [];
      for (const p of createdTask.parents ?? []) {
        const mapped = mapping.get(p);
        if (mapped) { relOps.push({ id: p, operation: 'removeParent' }); relOps.push({ id: mapped, operation: 'addParent' }); }
      }
      for (const c of createdTask.children ?? []) {
        const mapped = mapping.get(c);
        if (mapped) { relOps.push({ id: c, operation: 'removeChild' }); relOps.push({ id: mapped, operation: 'addChild' }); }
      }
      if (relOps.length > 0) {
        selfFixes.push({ id: createdTask.id, data: {}, relations: relOps });
      }
    }

    const allUpdates: UpdateTaskParams[] = [...relUpdates, ...selfFixes];
    if (allUpdates.length > 0) {
      const batch = await api.updateTasks({ updates: allUpdates });
      const [_, batchErr] = batch;
      if (batchErr) {
        return err(batchErr);
      }
    }

    // Assemble affected tasks (inserted + any updated)
    const affectedIdSet = new Set<string>([createdTask.id, ...allUpdates.map(u => u.id)]);
    const affectedIds = Array.from(affectedIdSet);
    let affectedTasks: Task[] = [];
    if (affectedIds.length > 0) {
      const { data: affectedData, error: affectedErr } = await supabase
        .from(TASK_TABLE_NAME)
        .select('*')
        .in('id', affectedIds);
      if (!affectedErr && affectedData) {
        affectedTasks = (affectedData as any[]).map(toTask);
      }
    }

    return ok({ oldId: createDetail.id ?? '', newId: createdTask.id, affectedTasks });
  },
  createTasks: async ({ createDetails }) => {
    // TODO:bulk This sequential insert is O(N) network round-trips. For large imports, replace with client_ref or RPC.
    const mapping = new Map<string, string>();
    const createdTasks: Task[] = [];

    for (const detail of createDetails) {
      const full = populateTaskDTO(detail);
      const { id: _drop, ...dto } = full; // drop client-provided id; server is authoritative
      const { data: row, error } = await supabase.from(TASK_TABLE_NAME).insert([dto]).select('*').single();
      if (error || !row) {
        if ((error as any)?.code === "42501") {
          return err(new NotAuthorizedError(`RLS policy failed for create task attempt: ${createDetails.map(t => t.title).join(', ')}`, error));
        }
        return err(new IOError(`[Supabase] Failed to create task: ${full.title}`, error, dto));
      }
      const created = toTask(row);
      if (detail.id) mapping.set(detail.id, created.id);
      createdTasks.push(created);
    }

    // Calculate inverse relationship updates using real IDs for all newly created tasks
    const relationshipUpdates = await getRelationshipUpdates(api, createdTasks.map(newTask => ({ oldTask: null, newTask })));

    // Fix the created tasks' own parents/children arrays where they referenced temp ids
    const selfFixes: UpdateTaskParams[] = [];
    for (const t of createdTasks) {
      const relOps: { id: string; operation: "addChild" | "removeChild" | "addParent" | "removeParent" }[] = [];
      for (const p of t.parents ?? []) {
        const mapped = mapping.get(p);
        if (mapped) { relOps.push({ id: p, operation: 'removeParent' }); relOps.push({ id: mapped, operation: 'addParent' }); }
      }
      for (const c of t.children ?? []) {
        const mapped = mapping.get(c);
        if (mapped) { relOps.push({ id: c, operation: 'removeChild' }); relOps.push({ id: mapped, operation: 'addChild' }); }
      }
      if (relOps.length > 0) {
        selfFixes.push({ id: t.id, data: {}, relations: relOps });
      }
    }

    const allUpdates: UpdateTaskParams[] = [...relationshipUpdates, ...selfFixes];
    if (allUpdates.length > 0) {
      const batch = await api.updateTasks({ updates: allUpdates });
      const [_, batchErr] = batch;
      if (batchErr) {
        return err(batchErr);
      }
    }

    // Build affected tasks set: created + updated
    const affectedIdSet = new Set<string>([...createdTasks.map(t => t.id), ...allUpdates.map(u => u.id)]);
    const affectedIds = Array.from(affectedIdSet);
    let affectedTasks: Task[] = [];
    if (affectedIds.length > 0) {
      const { data: affectedData, error: affectedErr } = await supabase
        .from(TASK_TABLE_NAME)
        .select('*')
        .in('id', affectedIds);
      if (!affectedErr && affectedData) {
        affectedTasks = (affectedData as any[]).map(toTask);
      }
    }

    return ok({ updatedIds: mapping, affectedTasks });
  },

  getTask: async ({ id }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').eq('id', id).single();
    if (error || !data) {
      return err(new NotFoundError('[Supabase] Task not found', id));
    }
    return ok(data);
  },
  getTasks: async ({ ids }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', ids);
    if (error) {
      return err(new IOError(`[Supabase] Failed to read tasks (${ids.join(', ')})`, error));
    }
    const foundIds = new Set((data ?? []).map((r: any) => r.id));

    for (const id of ids) {
      if (!ids.includes(id))
        return err(new NotFoundError('[Supabase] Task not found', id));
    }

    return ok(data ?? []);
  },
  getAllUserTasks: async ({ userId }) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').eq('user_id', userId);
    if (error) {
      return err(new IOError(`[Supabase] Failed to read tasks for user`, error, userId));
    }
    return ok((data ?? []));
  },

  updateTask: async (update: UpdateTaskParams) => {
    const [tasks, error] = await api.updateTasks({ updates: [update] });
    if (error) {
      return err(error);
    }

    return ok(tasks[0]);
  },
  updateTasks: async ({ updates }) => {
    if (updates.length === 0) return ok([]);
    const ids = updates.map(u => u.id);

    const existingRes = await supabase.from(TASK_TABLE_NAME).select('*').in('id', ids);
    if (existingRes.error) {
      return err(new IOError('[Supabase] Failed to read tasks for update', existingRes.error, ids));
    }

    const idToRow = new Map((existingRes.data ?? []).map((r: any) => [r.id, r] as [string, any]));

    const results: Task[] = [];

    for (const u of updates) {
      const current = idToRow.get(u.id) as Task | undefined;
      if (!current) {
        return err(new NotFoundError('[Supabase] Task not found for update', u.id));
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
        return err(new IOError(`[Supabase] Failed to update task ${u.id}`, error, patch));
      }

      results.push(data as Task);
    }

    return ok(results);
  },

  deleteTask: async ({ id }) => {
    const res = await supabase.from(TASK_TABLE_NAME).delete().eq('id', id).select('*').single();
    if (res.error) {
      return err(new IOError(`[Supabase] Failed to delete ${id}`, res.error));
    }
    if (!res.data) {
      return err(new NotFoundError('[Supabase] Task not found', id));
    }
    return ok();
  },
  deleteTasks: async ({ ids }) => {
    // Server-side: just delete the specific IDs provided (client handles recursion)
    if (ids.length === 0) return ok();

    const res = await supabase.from(TASK_TABLE_NAME).delete().in('id', ids).select('*');
    if (res.error) {
      return err(new IOError(`[Supabase] Failed to delete ${ids.join(', ')}`, res.error));
    }
    return ok();
  },

  /* changeOwnership: async ({ oldUserID, newUserID }) => {
    const { data: toChange, error: readErr } = await supabase.from(TASK_TABLE_NAME).select('*').eq('user_id', oldUserID);
    if (readErr) {
      return err(new IOError('[Supabase] Failed to read tasks for ownership change', readErr, oldUserID));
    }
    if (!toChange || toChange.length === 0) return ok([]);
    const { data, error } = await supabase
      .from(TASK_TABLE_NAME)
      .update({ user_id: newUserID, last_edit: new Date().toISOString() })
      .eq('user_id', oldUserID)
      .select('*');
    if (error || !data) {
      return err(new IOError('[Supabase] Failed to change ownership', error));
    }
    return ok(data);
  }, */

  getChildrenOf: async ({ id }) => {
    const [parent, parentErr] = await api.getTask({ id });
    if (parentErr) {
      return err(parentErr);
    }
    const childIds = parent.children ?? [];
    if (childIds.length === 0) return ok([]);

    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', childIds);
    if (error) {
      return err(new IOError(`[Supabase] Failed to find children for ${parent.title}`, error, childIds));
    }
    return ok(data ?? []);
  },
  getParentsOf: async ({ id }) => {
    const [child, childErr] = await api.getTask({ id });
    if (childErr) {
      return err(childErr);
    }
    const parentIds = child.parents ?? [];
    if (parentIds.length === 0) return ok([]);
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').in('id', parentIds);
    if (error) {
      return err(new IOError(`[Supabase] Failed to find parents for ${child.title}`, error, parentIds));
    }
    return ok(data ?? []);
  },
  getRootTasks: async () => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*').or('parents.is.null,parents.eq.{}');
    if (error) {
      return err(new IOError('[Supabase] Failed to fetch roots', error));
    }
    return ok(data ?? []);
  },

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
      return err(new IOError(`[Supabase] Failed to fetch today's tasks`, error));
    }
    return ok((data ?? []));
  },
  getPrioritizedTasks: async (limit: number) => {
    const { data, error } = await supabase.from(TASK_TABLE_NAME).select('*');
    if (error) {
      return err(new IOError('[Supabase] Failed to fetch tasks for prioritization', error));
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
}
export default api;


//#region Utilities

function toTask(row: any): Task {
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

//#endregion