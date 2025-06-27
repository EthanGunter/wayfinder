import { Err, IOError, NotFoundError } from "$lib/Errors";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { Result, err, ok } from "neverthrow";
import type { IStorage, CreateTaskDTO } from "./types";
import type { TaskData } from "./TaskData";

export class SupabaseStorage implements IStorage {
  private client: SupabaseClient;

  private constructor() {
    const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = import.meta.env?.VITE_SUPABASE_API_KEY || process.env.SUPABASE_API_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env vars missing');
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  static get(): Promise<SupabaseStorage> {
    return Promise.resolve(new SupabaseStorage());
  }

  async createTask(node: CreateTaskDTO): Promise<Result<string, Err>> {
    // Generate ID if not provided
    const created = new Date().toISOString();
    const insertObj = { ...node, created };

    const { data, error } = await this.client.from('tasks').insert([insertObj]).select('id').single();
    console.log("Create:", insertObj, "=>", data,);

    if (error) return err(new IOError("Write", "id", error, insertObj));
    // Return the generated ID
    return ok(data.id as string);
  }

  /** Filepath is basically ignored in the server's database */
  async readTask(id: string): Promise<Result<TaskData, NotFoundError | Err>> {
    // path is filepath, not id
    const { data, error } = await this.client.from('tasks').select().eq('id', id).single();
    if (error || !data) return err(new NotFoundError(id, 'Node'));
    return ok(data as TaskData);
  }

  async updateTask(id: string, updates: Partial<TaskData>): Promise<Result<TaskData, Err>> {
    const { data, error } = await this.client
      .from('tasks')
      .update({ ...updates, lastEdit: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return err(new IOError("Update", id, error, updates));
    return ok(data as TaskData);
  }

  async deleteTask(id: string, recursive: boolean): Promise<Result<void, Err>> {
    const { error } = await this.client.from('tasks').delete().eq('id', id);
    if (error) return err(new IOError("Delete", id, error));
    return ok();
  }

  async close(): Promise<void> {
    // No-op for Supabase client, but required by IStorage
    return;
  }
}