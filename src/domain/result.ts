// convex/_result.ts
export type Result<T, E = any> = [T, null] | [null, E];

export function ok(): [void, null];
export function ok<T>(value: T): [T, null];
export function ok<T>(value?: T) { return [value as T, null]; }
export const err = <E>(error: E): [null, E] => [null, error];