import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { type CreateTaskDTO, type ITaskStorage } from './types';
import { Result, err, ok } from 'neverthrow';
import { NotFoundError, IOError, ParseError, NotImplemented } from '$lib/Errors';
import * as path from 'path'
import { v4 } from 'uuid';
import { type TaskData, Task } from './Task';

// TODO Write tests for NativeStorage
// TODO Document NativeStorage
export class NativeTaskStorage implements ITaskStorage {
    private db: SQLiteDBConnection | null = null;
    private vaultPath: string;

    private constructor(vaultPath: string) {
        this.vaultPath = vaultPath;
    }

    static async get(vaultPath: string): Promise<NativeTaskStorage> {
        const sqlite = new SQLiteConnection(CapacitorSQLite);
        const dbName = 'wayfinder.db';
        const res = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
        const storage = new NativeTaskStorage(vaultPath);
        storage.db = res;
        await storage.db.open();

        // Create table if not exists
        await storage.db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        filepath TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        created TEXT NOT NULL,
        lastEdit TEXT,
        dependsOn TEXT,
        dependants TEXT
      );
    `);

        return storage;
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db?.close();
            this.db = null;
        }
    }

    async createTask(task: CreateTaskDTO): Promise<Result<string, IOError | NotFoundError | ParseError>> {
        const created = new Date().toISOString();
        const id = v4();
        const fullTask: TaskData = { ...task, created, id };

        // Write markdown file
        const md = Task.toMarkdown(fullTask);
        const file = {
            path: fullTask.filepath,
            data: md,
            directory: Directory.Documents // or Directory.Data, depending on your needs
        }
        try {
            await Filesystem.writeFile(file);
        } catch (e) {
            return err(new IOError("Write", fullTask.filepath, e, file));
        }

        // Update index from file
        const updateRes = await this.updateIndexFromFile(fullTask.filepath);
        if (updateRes.isErr()) {
            return err(updateRes.error);
        }

        return ok(id);
    }

    async readTask(id: string): Promise<Result<TaskData, NotFoundError | ParseError>> {
        if (!this.db) throw new Error("Database not initialized");
        // Read from SQLite only (optimization)
        const res = await this.db.query('SELECT * FROM tasks WHERE id = ?', [id]);
        if (res.values && res.values.length > 0) {
            // Convert dependants from JSON string if present
            const row = res.values[0];
            if (row.dependants && typeof row.dependants === 'string') {
                try {
                    row.dependants = JSON.parse(row.dependants);
                } catch {
                    console.log("row.dependants is not what we thought it was:", row.dependants);

                    row.dependants = [];
                }
            }
            return ok(row as TaskData);
        }
        return err(new NotFoundError(id, 'Task'));
    }

    async updateTask(id: string, updates: Partial<TaskData>): Promise<Result<TaskData, NotFoundError | IOError | ParseError>> {
        // Get current task from DB
        const current = await this.readTask(id);
        if (current.isErr()) return err(current._unsafeUnwrapErr());

        const updated: TaskData = {
            ...current._unsafeUnwrap(),
            ...updates,
            lastEdit: new Date().toISOString()
        };

        // Write updated markdown file
        const md = Task.toMarkdown(updated);
        const file = {
            path: updated.filepath,
            data: md,
            directory: Directory.Documents
        };
        try {
            await Filesystem.writeFile(file);
        } catch (e) {
            return err(new IOError("Write", updated.filepath, e, file));
        }

        // Update index from file
        const idxResult = await this.updateIndexFromFile(updated.filepath);
        if (idxResult.isErr()) return err(idxResult._unsafeUnwrapErr());

        return ok(updated);
    }

    /**
     * @param recursive NOT IMPLEMENTED
     */
    async deleteTask(id: string, recursive: boolean): Promise<Result<void, IOError>> {
        if (recursive) throw new NotImplemented("NativeTaskStorage.deleteTask(recursive = true)");

        if (!this.db) throw new Error("Database not initialized");
        // Get filepath from DB
        const res = await this.db.query('SELECT filepath FROM tasks WHERE id = ?', [id]);
        if (res.values && res.values.length > 0) {
            const filepath = res.values[0].filepath;
            try {
                await Filesystem.deleteFile({
                    path: filepath,
                    directory: Directory.Documents
                });
            } catch (e) {
                // If file doesn't exist, ignore
                console.warn(`Attempted to delete task that doesn't exist: ${id}`);
            }
        }
        // Remove from SQLite
        await this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
        return ok();
    }

    async updateIndexFromFile(filepath: string): Promise<Result<void, NotFoundError | ParseError | IOError>> {
        if (!this.db) throw new Error("Database not initialized");
        // Read file
        let fileContent: string;
        try {
            const file = await Filesystem.readFile({
                path: filepath,
                directory: Directory.Documents
            });

            if (typeof file.data !== 'string') {
                return err(new ParseError(file.data, "filedata string"));
            }

            fileContent = file.data;
        } catch (e) {
            return err(new NotFoundError(filepath, "File"));
        }

        // Parse markdown
        const taskResult = Task.fromMarkdown(fileContent, filepath);
        if (taskResult.isErr()) return err(taskResult._unsafeUnwrapErr());
        const task = taskResult._unsafeUnwrap();

        // Store in SQLite
        try {
            await this.db.run(
                `INSERT OR REPLACE INTO tasks (id, filepath, title, content, created, lastEdit, dependsOn, dependants)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    task.id,
                    task.filepath, ///TODO We'll deal with this later... path.join(this.vaultPath, task.filepath),
                    task.title,
                    task.content ?? null,
                    task.created,
                    task.lastEdit ?? null,
                    task.dependsOn ?? null,
                    task.dependants ? JSON.stringify(task.dependants) : null
                ]
            );
        } catch (e) {
            return err(new IOError("Write", filepath, e, task));
        }

        return ok();
    }
}