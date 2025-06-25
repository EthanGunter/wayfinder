// __mocks__/@capacitor/filesystem.ts
import { vi } from 'vitest';

const files: Record<string, string> = {};

export const Filesystem = {
  writeFile: vi.fn().mockImplementation(async ({ path, data }) => {
    files[path] = data;
    return;
  }),
  readFile: vi.fn().mockImplementation(async ({ path }) => {
    if (!(path in files)) throw new Error('File not found');
    return { data: files[path] };
  }),
  deleteFile: vi.fn().mockImplementation(async ({ path }) => {
    if (!(path in files)) throw new Error('File not found');
    delete files[path];
    return;
  }),
  // Optionally, add a helper to clear state between tests
  __reset: () => {
    for (const key in files) delete files[key];
  }
};

export const Directory = { Documents: 'DOCUMENTS' };