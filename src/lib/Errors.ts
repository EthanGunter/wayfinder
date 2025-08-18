export enum ErrorType {
    PlaceholderError = "Error - PlaceholderError",
    ArgumentError = "Error - InvalidArgument",
    InvalidState = "Error - InvalidState",
    NotFoundError = "Error - NotFound",
    ParseError = "Error - FailedParse",
    IOError = "Error - InputOutput",
    NotImplementedError = "Error - NotImplemented",
    NotHandledError = "Error - NotHandled",
    InputRequired = "Error - InputRequired"
}

const STACK_REG = /at (.*)\(https?:\/\/[a-z\-]*(?::[0-9]*|\.[a-z]*)(\/.*?)\?.=.*:([0-9]+):([0-9]+)/;
export class Err {
    static wrap(nativeError: Error): Err {
        return new Err(1, nativeError.name ?? "unknown", nativeError.message, JSON.stringify(nativeError, undefined, 2));
    }
    static UNHANDLED(error: Err | any, message?: string): never {
        // TODO: link to bug report system. Unhandled errors shouldn't happen
        if (!(error instanceof Err)) {
            error = new Err(1, "Unknown", message ?? "", error);
        }
        error.inheritanceDepth++;
        error.withTrace();
        
        // TODO: Import ReportingService and call reportError() here when ready
        if (error.context)
            console.error("HANDLER NOT IMPLEMENTED for: ", error.type + ": " + error.msg, error.context);
        else
            console.error("HANDLER NOT IMPLEMENTED for: ", error.type + ": " + error.msg);
        throw error.stack;
    }
    static throw(error: Err | any, message?: string): never {
        // TODO: link to bug report system. Unhandled errors shouldn't happen  
        if (!(error instanceof Err)) {
            error = new Err(1, "Unknown", message ?? "", JSON.stringify(error, undefined, 2));
        }
        error.inheritanceDepth++;
        error.withTrace();
        
        // TODO: Import ReportingService and call reportError() here when ready
        if (error.context)
            console.error(error.type + ": " + error.msg, error.context);
        else
            console.error(error.type + ": " + error.msg);
        throw error.stack;
    }

    stack: Error | null = null;
    // stack: string[] = ["call .withTraceDepth() for stacktrace"];
    private traceDepth: number | undefined;
    // private inheritanceDepth: number;
    /**
     * @param inheritanceDepth helps keep the stacktrace clean. -1 doesn't generate a stacktrace
     */
    constructor(private inheritanceDepth: number, public type: string, public msg: string, public context?: any) {
    }

    /**
     * Forces this error to generate a stacktrace when it's created
     * @param depth The number of frames to collect. -1 returns the entire stack
     */
    withTrace(depth: number = -1) {
        // TODO Don't execute this logic in prod
        // https://github.com/LZS911/vite-plugin-conditional-compile

        if (this.traceDepth) return this;

        this.traceDepth = depth;

        // Capture stack trace
        const err = new Error();
        let stack: string[] = []
        if (err.stack) {
            if (depth < 0) {
                stack = err.stack.split('\n').slice(this.inheritanceDepth);
            } else {
                // Skip the error frames and keep only the relevant code frames
                stack = err.stack.split('\n').slice(this.inheritanceDepth, this.inheritanceDepth + this.traceDepth + 2)
            }
        }
        err.stack = stack.join('\n');
        err.name = this.type.split('- ')[1] + " | TRACE:"
        this.stack = err;
        return this;
    }

    logError() {
        // TODO: link to bug report system. Unhandled errors shouldn't happen
        // TODO: Import ReportingService and call reportError() here when ready
        if (this.context) {
            if (this.stack)
                console.error(this.type + ": " + this.msg, this.context, this.stack);
            else
                console.error(this.type + ": " + this.msg, this.context);
        }
        else {
            if (this.stack)
                console.error(this.type + ": " + this.msg, this.stack);
            else
                console.error(this.type + ": " + this.msg);
        }
    }
    logWarning() {
        // TODO: link to bug report system. Unhandled warnings shouldn't happen
        // TODO: Import ReportingService and call reportError() here when ready
        if (this.context)
            console.warn(this.type + ": " + this.msg, this.context);
        else
            console.warn(this.type + ": " + this.msg);
    }

    toString() {
        return this.type + ": " + this.msg
    }

    private prepForConsole() {
        const cleaned: any = { ...this };
        // delete cleaned.type;
        // delete cleaned.msg;
        delete cleaned.inheritanceDepth;
        delete cleaned.traceDepth;
        delete cleaned.stack;
        return this.context;
    };
}

export type UnknownError = Err;

export class InvalidStateError extends Err {
    constructor(message: string, context?: any) {
        super(1, ErrorType.InvalidState, message, context);
    }
}
export class ArgumentError extends Err {
    constructor(argument: any, reason: string, context?: any) {
        super(1, ErrorType.ArgumentError, reason, { argument, context });
    }
}
export class InputRequiredError extends Err {
    constructor(message: string, context?: any) {
        super(1, ErrorType.InputRequired, message, context);
    }
}

export class NotFoundError extends Err {
    constructor(msg: string = "Item", key: any) {
        super(1, ErrorType.NotFoundError, msg, key);
    }
}

export class ParseError extends Err {
    constructor(content: any, targetType: string) {
        super(1, ErrorType.ParseError, `Failed to parse content to ${targetType}`, content);
    }
}


export class IOError extends Err {
    constructor(message: string, internalError: any, context?: any) {
        let internal;
        if (typeof internalError === "string") {
            internal = internalError;
        } else if (internalError instanceof Error) {
            internal = internalError.message;
        } else {
            internal = internalError;
        }
        super(
            1,
            ErrorType.IOError,
            message,
            { internalError: internal, dataToWrite: context }
        );
    }
}

export class NotImplementedError extends Err {
    constructor(methodName: string) {
        super(1, ErrorType.NotImplementedError, `${methodName}`);
    }
}