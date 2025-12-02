// errors.ts — preserve source maps; rebase at throw site; exclude internal frames via captureStackTrace

/* import { settings } from "$lib/user-settings";

const dev = settings.dev.$enabled;
if (dev) console.log("Err system in DEV mode"); */

function captureHere(err: Error, excludeFn: Function) {
    Error.captureStackTrace(err, excludeFn);
}
export type ErrContext = { messageForDev?: string, [key: string]: any };
export class Err extends Error {
    context?: ErrContext;
    cause?: unknown;

    constructor(name: string, public message: string, context?: ErrContext) {
        super(message);
        this.name = name;
        this.context = context;
        // Important: pass the concrete constructor to exclude it from the stack
        captureHere(this, this.constructor);
    }

    static wrap(nativeError: Error): Err {
        const e = new Err(nativeError.name || "Error", nativeError.message, {
            wrapped: true,
        });
        e.cause = nativeError;
        // Exclude this wrap call from the stack by passing the current static fn
        captureHere(e, Err.wrap);
        return e;
    }

    static UNHANDLED<T = unknown>(error: T, message?: string): never {
        const baseMsg =
            (message ? message + " - " : "") +
            (error instanceof Err ? error.message : JSON.stringify(error));

        const e =
            error instanceof Err
                ? new Err(error.name, baseMsg, error.context)
                : error instanceof Error
                    ? new Err(error.name || "Error", baseMsg)
                    : new Err("Unknown", baseMsg, { value: error });

        e.cause = error instanceof Error ? error : undefined;

        if (e.context) {
            e.message += "\nContext: " + JSON.stringify(e.context, undefined, 2) + "\n";
        }
        e.message += "\nHANDLER NOT IMPLEMENTED";

        // Exclude UNHANDLED itself from the stack; preserves mapping
        captureHere(e, Err.UNHANDLED);
        throw e;
    }

    static AssertNever(value: any, message?: string): never {
        const msg = message || "Unexpected value should never happen";
        const e = new Err("AssertNever", msg, { value });
        captureHere(e, Err.AssertNever);
        throw e;
    }

    static NotImplemented(location: string): never {
        throw new NotImplementedError(location);
    }

    static throw(error: unknown, message?: string): never {
        const baseMsg =
            (message ? message + " - " : "") +
            (error instanceof Error ? error.message : String(error));

        const e =
            error instanceof Err
                ? new Err(error.name, baseMsg, error.context)
                : error instanceof Error
                    ? new Err(error.name || "Error", baseMsg)
                    : new Err("Unknown", baseMsg, { value: error });

        e.cause = error instanceof Error ? error : undefined;

        // Exclude Err.throw itself
        captureHere(e, Err.throw);
        throw e;
    }

    UNHANDLED(message?: string): never {
        return Err.UNHANDLED(this, message);
    }
}

export class UnknownError extends Err {
    constructor(message: string, context?: ErrContext) {
        super("UnknownError", message, context);
    }
}

export class InvalidStateError extends Err {
    constructor(message: string, context?: ErrContext) {
        super("InvalidState", message, context);
    }
}

export class ArgumentError<T = unknown> extends Err {
    constructor(message: string, argument: T, context?: ErrContext) {
        super("ArgumentError", message, { argument, ...context });
    }
}

export class InputRequiredError extends Err {
    constructor(message: string, context?: ErrContext) {
        super("InputRequired", message, context);
    }
}

export class NotFoundError extends Err {
    constructor(message: string, key?: any) {
        super("NotFoundError", message, key);
    }
}

export class NotAuthorizedError extends Err {
    constructor(message: string, context?: ErrContext) {
        super("NotAuthorizedError", message, context);
    }
}

export class ParseError extends Err {
    constructor(content: any, targetType: string, public start: number, public end: number) {
        super("ParseError", `Failed to parse content to ${targetType}`, content);
    }
}


export class NotImplementedError extends Err {
    constructor(methodName: string, context?: ErrContext) {
        super("NotImplementedError", `${methodName}`, context);
    }
}