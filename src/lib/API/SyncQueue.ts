type FunctionMap<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
    : never;
};

type ArgsFor<T, K extends keyof T> = T[K] extends (...args: infer A) => any ? A : never;
type SyncQueueEntry<RemoteT, ReverterT, RemoteK extends keyof RemoteT, ReverterK extends keyof ReverterT> = {
    fnName: RemoteK;
    args: ArgsFor<RemoteT, RemoteK>;
    revertFnName: ReverterK;
    revertArgs: ArgsFor<ReverterT, ReverterK>,
    uiErrorMessage: string
};

export class SyncQueue<RemoteT, ReverterT> {
    private queue: Array<SyncQueueEntry<RemoteT, ReverterT, keyof RemoteT, keyof ReverterT>> = []
    private fnMap: FunctionMap<RemoteT & ReverterT>;

    constructor(fnMap: FunctionMap<RemoteT & ReverterT>) {
        this.fnMap = fnMap;
    }

    add<RemoteK extends keyof RemoteT, ReverterK extends keyof ReverterT>(
        fnName: RemoteK,
        args: ArgsFor<RemoteT, RemoteK>,
        revertFnName: ReverterK,
        revertArgs: ArgsFor<ReverterT, ReverterK>,
        uiErrorMessage: string
    ) {
        this.queue.push({ fnName, args, revertFnName, revertArgs, uiErrorMessage });
    }

    async process() {
        for (const entry of [...this.queue]) {
            try {
                const result = await (this.fnMap[entry.fnName])(...entry.args);
                if (result.isErr()) {
                    await (this.fnMap[entry.revertFnName] as any)(...entry.revertArgs);
                }
                this.queue.shift();
            }
            catch (e) {
                await (this.fnMap[entry.revertFnName] as any)(e);
            }
        }
    }
}