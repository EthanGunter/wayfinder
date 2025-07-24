import type { Err, UnknownError } from "$lib/Errors";
import { Result as _Result, Err as _Err, err, ok, Ok } from "neverthrow";

export type Result<T, E = UnknownError> = _Result<T, E>
export type BatchResult<T, TE extends Err = UnknownError, E extends Err = UnknownError> = Result<Result<T, TE>[], E>
export function okBatch<T>(successes: T[]) {
  return ok(successes.map(t => ok(t)));
}
export function errBatch<T, E>(failures: E[], successes?: T[]) {

  return ok([...failures.map(e => err(e)), ...successes?.map(t => ok(t)) ?? []]);
}
export function extractBatch<T, TE extends Err = UnknownError, E extends Err = UnknownError>(batch: BatchResult<T, TE, E> | Result<T, TE>[]): [T[], TE[]] {
  if (!Array.isArray(batch)) {
    if (batch.isErr()) return [[], []];
    batch = batch.value;
  }

  const success: T[] = [], failure: TE[] = [];
  batch.forEach(r => {
    if (r.isOk()) success.push(r.value);
    else failure.push(r.error);
  })

  return [success, failure];
}

export function extractBatchAndLogErrors<T, TE extends Err = UnknownError, E extends Err = UnknownError>(batch: BatchResult<T, TE, E> | Result<T, TE>[]): T[] {
  if (!Array.isArray(batch)) {
    if (batch.isErr()) return [];
    batch = batch.value;
  }

  const success: T[] = [], failure: TE[] = [];
  batch.forEach(r => {
    if (r.isOk()) success.push(r.value);
    else {
      r.error.logError();
    }
  })

  return success;
}


export interface IProvider<T> {
  get(): Promise<T>;
  close(): Promise<void>
}