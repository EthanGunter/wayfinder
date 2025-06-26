import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { type CreateTaskDTO, type IStorage } from './types';
import { Result, err, ok } from 'neverthrow';
import { NotFoundError, IOError, ParseError } from '$lib/Errors';
import * as path from 'path'
import { v4 } from 'uuid';
import { type TaskData, Task } from './TaskData';

// TODO Write tests for NativeStorage
// TODO Document NativeStorage
export class NativeStorage implements IStorage {
    private db: SQLiteDBConnection | null = null;
    private vaultPath: string;

    private constructor(vaultPath: string) {
        this.vaultPath = vaultPath;
    }

    static async get(vaultPath: string): Promise<NativeStorage> {
        const sqlite = new SQLiteConnection(CapacitorSQLite);
        const dbName = 'wayfinder.db';
        const res = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
        const storage = new NativeStorage(vaultPath);
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

    async createNode(node: CreateTaskDTO): Promise<Result<string, IOError | NotFoundError | ParseError>> {
        const created = new Date().toISOString();
        const id = v4();
        const fullNode: TaskData = { ...node, created, id };

        // Write markdown file
        const md = Task.toMarkdown(fullNode);
        const file = {
            path: fullNode.filepath,
            data: md,
            directory: Directory.Documents // or Directory.Data, depending on your needs
        }
        try {
            // console.log("Fullnode:", fullNode);
            // console.log(md);
            await Filesystem.writeFile(file);
        } catch (e) {
            return err(new IOError("Write", fullNode.filepath, e, file));
        }

        // Update index from file
        const updateRes = await this.updateIndexFromFile(fullNode.filepath);
        if (updateRes.isErr()) {
            return err(updateRes.error);
        }

        return ok(id);
    }

    async readNode(id: string): Promise<Result<TaskData, NotFoundError | ParseError>> {
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
        return err(new NotFoundError(id, 'Node'));
    }

    async updateNode(id: string, updates: Partial<TaskData>): Promise<Result<TaskData, NotFoundError | IOError | ParseError>> {
        // Get current node from DB
        const current = await this.readNode(id);
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

    async deleteNode(id: string/* , recursive: boolean */): Promise<Result<void, IOError>> {
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
        const nodeResult = Task.fromMarkdown(fileContent, filepath);
        if (nodeResult.isErr()) return err(nodeResult._unsafeUnwrapErr());
        const node = nodeResult._unsafeUnwrap();

        // Store in SQLite
        try {
            await this.db.run(
                `INSERT OR REPLACE INTO tasks (id, filepath, title, content, created, lastEdit, dependsOn, dependants)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    node.id,
                    path.join(this.vaultPath, node.filepath),
                    node.title,
                    node.content ?? null,
                    node.created,
                    node.lastEdit ?? null,
                    node.dependsOn ?? null,
                    node.dependants ? JSON.stringify(node.dependants) : null
                ]
            );
        } catch (e) {
            return err(new IOError("Write", filepath, e, node));
        }

        return ok();
    }
}