// __mocks__/@capacitor-community/sqlite.ts
import { vi } from 'vitest';

class MockDB {
  private data: Record<string, any> = {};
  async open() { }
  async close() { }
  async execute(sql: string) { }
  async query(sql: string, params: any[]) {
    if (sql.includes('SELECT * FROM tasks WHERE id = ?')) {
      const id = params[0];
      if (this.data[id]) return { values: [this.data[id]] };
      return { values: [] };
    }
    else if (sql.includes('SELECT filepath FROM tasks WHERE id = ?')) {
      const id = params[0];
      if (this.data[id]) return { values: [{ filepath: this.data[id].filepath }] };
      return { values: [] };
    }
    
    return { values: [] };
  }
  async run(sql: string, params: any[]) {
    if (sql.startsWith('INSERT OR REPLACE')) {      
      const [id, filepath, title, content, created, lastEdit, dependsOn, dependants] = params;
      this.data[id] = { id, filepath, title, content, created, lastEdit, dependsOn, dependants };
    }
    else if (sql.startsWith('DELETE')) {
      const id = params[0];
      delete this.data[id];
    }
  }
  __reset() {
    this.data = {};
  }
}

export class SQLiteConnection {
  createConnection = vi.fn().mockResolvedValue(new MockDB());
}