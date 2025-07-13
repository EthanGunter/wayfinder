import { Err, IOError, NotFoundError, NotImplemented } from "$lib/Errors";
import { SupabaseClient } from "@supabase/supabase-js";
import { Result, err, ok } from "neverthrow";
import type { ITaskStorage, CreateTaskDTO } from "./types";
import type { TaskData } from "./Task";
import supabase from "../SupabaseClient";

export class SupabaseTaskStorage implements ITaskStorage {
  private client: SupabaseClient;

  private constructor() {
    this.client = supabase;
  }

  static get(): Promise<SupabaseTaskStorage> {
    return Promise.resolve(new SupabaseTaskStorage());
  }

  async createTask(task: CreateTaskDTO): Promise<Result<string, Err>> {
    // Generate ID if not provided
    const created = new Date().toISOString();
    const insertObj = { ...task, created };

    const { data, error } = await this.client.from('tasks').insert([insertObj]).select('id').single();

    if (error) return err(new IOError("Write", "id", error, insertObj));
    // Return the generated ID
    return ok(data.id as string);
  }

  /** Filepath is basically ignored in the server's database */
  async readTask(id: string): Promise<Result<TaskData, NotFoundError | Err>> {
    // path is filepath, not id
    const { data, error } = await this.client.from('tasks').select().eq('id', id).single();
    if (!data) return err(new NotFoundError(id, 'Task'));
    if (error) return err(new IOError("Read", id, error));

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

  /**
   * @param recursive NOT IMPLEMENTED
   */
  async deleteTask(id: string, recursive: boolean): Promise<Result<void, Err>> {
    if (recursive) throw new NotImplemented("SupabaseStorage.deleteTask(recursive = true)");
    const { error } = await this.client.from('tasks').delete().eq('id', id);
    if (error) return err(new IOError("Delete", id, error));
    return ok();
  }

  async close(): Promise<void> {
    // No-op for Supabase client, but required by IStorage
    return;
  }
}