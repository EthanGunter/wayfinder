export enum ErrorTypes {
    ArgumentError = "ArgumentError",
    NotFoundError = "NotFoundError",
    ParseError = "ParseError",
    IOError = "IOError",
    NotImplementedError = "NotImplementedError",
}

export class Err {
    static Wrap(nativeError: Error): Err {
        return new Err(0, nativeError.name ?? "unknown", nativeError.message, nativeError);
    }

    stack: string[] = ["call .withTraceDepth() for stacktrace"];
    private traceDepth: number | undefined;
    // private inheritanceDepth: number;
    /**
     * @param inheritanceDepth helps keep the stacktrace clean. -1 doesn't generate a stacktrace
     */
    constructor(private inheritanceDepth: number, public type: string, public msg: string, public context?: any) {
        this.withTrace(3);
    }

    /**
     * Forces this error to generate a stacktrace when it's created
     * @param depth The number of frames to collect. -1 returns the entire stack
     */
    withTrace(depth: number) {
        // TODO Don't execute this logic in prod
        // https://github.com/LZS911/vite-plugin-conditional-compile
        this.traceDepth = depth;

        // Capture stack trace
        const err = new Error();
        if (err.stack) {
            if (depth < 0) {
                this.stack = err.stack.split('\n').map(line => line.trim().replace("at ", ""));
            } else {
                // Skip the error frames and keep only the relevant code frames
                this.stack = err.stack.split('\n').slice(this.inheritanceDepth + 2, this.inheritanceDepth + this.traceDepth + 2).map(line => line.trim().replace("at ", ""));
            }
        }
        return this;
    }

    logError() {
        console.error(this.msg, this.toJSON());
    }
    logWarning() {
        console.warn(this.msg, this.toJSON());
    }
    /** TODO turns out the following is not the case... Lets us hide irrelevant data when the object is thrown or .log()ed */
    private toJSON() {
        const cleaned: any = { ...this };
        delete cleaned.msg;
        delete cleaned.inheritanceDepth;
        delete cleaned.traceDepth;
        return cleaned;
    };
}

export class ArgumentError extends Err {
    constructor(argument: string, reason: string) {
        super(1, ErrorTypes.ArgumentError, `${argument} invalid`, reason);
    }
}

export class NotFoundError extends Err {
    constructor(item: any, type: string = "Item") {
        super(1, ErrorTypes.NotFoundError, `${type} NotFound`, item);
    }
}

export class ParseError extends Err {
    constructor(content: any, targetType: string) {
        super(1, ErrorTypes.ParseError, `Failed to parse content to ${targetType}`, content);
    }
}


export class IOError extends Err {
    constructor(message: string, internalError: any, context?: any) {
        super(
            1,
            ErrorTypes.IOError,
            message,
            { internalError, dataToWrite: context }
        );
    }
}

export class NotImplementedError extends Err {
    constructor(methodName: string) {
        super(1, ErrorTypes.NotImplementedError, `${methodName} not implemented`);
    }
}