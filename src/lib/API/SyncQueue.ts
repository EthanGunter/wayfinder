import { err, ok } from "neverthrow";
import type { Result } from "./types";
import { Err } from "$lib/Errors";

type FunctionMap<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
    ? (args: ParamsOf<T[K]>) => ReturnType<T[K]>
    : never;
};

type ParamsOf<T> = T extends (arg: infer P) => any ? P : never;

type FailureOfHandler<T> =
    T extends (result: Result<any, infer F>) => any ? F : "SyncQueue handlers must use single Result<T,E> parameter";

type SyncQueueEntry<RemoteT, CallbackT, RemoteK extends keyof RemoteT, CallbackK extends keyof CallbackT> = {
    fnName: RemoteK;
    args: ParamsOf<RemoteT[RemoteK]>;
    handlerFnName: CallbackK;
    revertArgs: FailureOfHandler<CallbackT[CallbackK]>,
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
        handlerFnName: CallbackK,
        revertArgs: FailureOfHandler<CallbackT[CallbackK]>,
    ) {
        this.queue.push({ fnName, args, handlerFnName: handlerFnName, revertArgs });
        this.process();
    }

    async process() {
        for (const entry of [...this.queue]) {
            try {
                const fn = this.fnMap[entry.fnName];
                if (!fn) Err.throw(`${entry.fnName.toString()} not found in syncQueue`);
                const result = await fn(entry.args);
                if (!result) Err.throw(`${entry.fnName.toString()} returned an undefined result`)

                if (result.isErr()) {
                    await (this.fnMap[entry.handlerFnName] as any)(err(entry.revertArgs));
                } else {
                    await (this.fnMap[entry.handlerFnName] as any)(ok(entry.revertArgs));
                }
                this.queue.shift();
            }
            catch (e) {
                await (this.fnMap[entry.handlerFnName] as any)(err(entry.revertArgs));
                throw e;
            }
        }
    }
}