import { Err, type UnknownError } from "$lib/Errors";
import { Result as _Result, Err as _Err, err, ok, Ok } from "neverthrow";

export type Result<T, E = UnknownError> = _Result<T, E>
export type BatchResult<T, TE extends Err = UnknownError, E extends Err = UnknownError> = Result<{ successes: T[]; errors: TE[] }, E>
export function okBatch<T, TE extends Err = UnknownError>(successes: T[], failures?: TE[]) {
  return ok({ successes, errors: failures ?? [] });
}


export interface IProvider<T> {
  get(): Promise<T>;
  // close(): Promise<void>
}