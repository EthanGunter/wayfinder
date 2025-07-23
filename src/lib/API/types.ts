import type { IAuthAPI, ILocalAuthAPI, ILocalAuthFunctions } from "./Auth/types";
import type { ITaskExporter, ITaskAPI } from "./Tasks";

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