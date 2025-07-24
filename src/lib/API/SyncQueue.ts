import { err, ok } from "neverthrow";
import type { Result } from "./types";

type FunctionMap<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
    ? (args: ParamsOf<T[K]>) => ReturnType<T[K]>
    : never;
};

type ParamsOf<T> = T extends (arg: infer P) => any ? P : never;

type FailureOfHandler<T> =
    T extends (result: Result<any, infer F>) => any ? F : never;

type SyncQueueEntry<RemoteT, CallbackT, RemoteK extends keyof RemoteT, CallbackK extends keyof CallbackT> = {
    fnName: RemoteK;
    args: ParamsOf<RemoteT[RemoteK]>;
    revertFnName: CallbackK;
    revertArgs: FailureOfHandler<CallbackT[CallbackK]>,
    uiErrorMessage: string
};


export class SyncQueue<RemoteT, CallbackT> {
    private queue: Array<SyncQueueEntry<RemoteT, CallbackT, keyof RemoteT, keyof CallbackT>> = []
    private fnMap: FunctionMap<RemoteT & CallbackT>;

    constructor(fnMap: FunctionMap<RemoteT & CallbackT>) {
        this.fnMap = fnMap;
    }

    add<RemoteK extends keyof RemoteT, CallbackK extends keyof CallbackT>(
        fnName: RemoteK,
        args: ParamsOf<RemoteT[RemoteK]>,
        revertFnName: CallbackK,
        revertArgs: FailureOfHandler<CallbackT[CallbackK]>,
        uiErrorMessage: string
    ) {
        this.queue.push({ fnName, args, revertFnName, revertArgs, uiErrorMessage });
    }

    async process() {
        for (const entry of [...this.queue]) {
            try {
                const result = await (this.fnMap[entry.fnName])(entry.args);
                if (result.isErr()) {
                    await (this.fnMap[entry.revertFnName] as any)(err(entry.revertArgs));
                } else {
                    await (this.fnMap[entry.revertFnName] as any)(ok(entry.revertArgs));
                }
                this.queue.shift();
            }
            catch (e) {
                await (this.fnMap[entry.revertFnName] as any)(err(entry.revertArgs));
                throw e;
            }
        }
    }
}