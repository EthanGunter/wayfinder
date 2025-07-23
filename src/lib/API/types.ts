import type { Err, UnknownError } from "$lib/Errors";
import type { Result as _Result } from "neverthrow";
import type { IAuthAPI, ILocalAuthAPI, ILocalAuthFunctions } from "./Auth/types";
import type { ITaskExporter, ITaskAPI } from "./Tasks";

export type Result<T, E extends Err = UnknownError> = _Result<T, E>

export interface IProvider<T> {
  get(): Promise<T>;
  close(): Promise<void>
}

export interface ILocalTaskProvider {
  get(remoteTasks?: ITaskAPI): Promise<ITaskAPI & ITaskExporter>;
  close(): Promise<void>
}

export interface ILocalAuthProvider {
  get(remoteAuth?: IAuthAPI, remoteTasks?: ITaskAPI): Promise<ILocalAuthAPI & ILocalAuthFunctions>;
  close(): Promise<void>
}

export type BatchResult<T, TE extends Err = UnknownError, E extends Err = UnknownError> = Result<Result<T, TE>[], E>
