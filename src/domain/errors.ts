// errors.ts — preserve source maps; rebase at throw site; exclude internal frames via captureStackTrace

/* import { settings } from "$lib/user-settings";

const dev = settings.dev.$enabled;
if (dev) console.log("Err system in DEV mode"); */

function captureHere(err: Error, excludeFn: Function) {
    if ((Error as any).captureStackTrace) {
        (Error as any).captureStackTrace(err, excludeFn);
    }
}
type ErrContext = { messageForDev?: string, [key: string]: any };
export class Err extends Error {
    context?: ErrContext;
    cause?: unknown;

    constructor(name: string, public messageForUser: string, context?: ErrContext) {
        super(messageForUser);
        this.name = name;
        this.context = context;
        // Important: pass the concrete constructor to exclude it from the stack
        captureHere(this, (this as any).constructor);
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
            e.messageForUser += "\nContext: " + JSON.stringify(e.context, undefined, 2) + "\n";
        }
        e.messageForUser += "\nHANDLER NOT IMPLEMENTED";

        // Exclude UNHANDLED itself from the stack; preserves mapping
        captureHere(e, Err.UNHANDLED);
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
}

export class UnknownError extends Err {
    constructor(message: string, cause?: Error) {
        super("UnknownError", message, cause);
    }
}

export class InvalidStateError extends Err {
    constructor(message: string, context?: any) {
        super("InvalidState", message, context);
    }
}

export class ArgumentError extends Err {
    constructor(msg: string, argument: any, context?: any) {
        super("ArgumentError", msg, { argument, context });
    }
}

export class InputRequiredError extends Err {
    constructor(message: string, context?: any) {
        super("InputRequired", message, context);
    }
}

export class NotFoundError extends Err {
    constructor(msg: string, key?: any) {
        super("NotFoundError", msg, key);
    }
}

export class NotAuthorizedError extends Err {
    constructor(msg: string = "Not authorized", context?: any) {
        super("NotAuthorizedError", msg, context);
    }
}

export class ParseError extends Err {
    constructor(content: any, targetType: string, public start: number, public end: number) {
        super("ParseError", `Failed to parse content to ${targetType}`, content);
    }
}
export class IOError extends Err {
    constructor(message: string, internalError: any, context?: any) {
        const internal =
            typeof internalError === "string"
                ? internalError
                : internalError instanceof Error
                    ? internalError.message
                    : internalError;

        super("IOError", message, { internalError: internal, dataToWrite: context });

        if (internalError instanceof Error) {
            this.cause = internalError;
        }
    }
}

export class NotImplementedError extends Err {
    constructor(methodName: string) {
        super("NotImplementedError", `${methodName}`);
    }
}