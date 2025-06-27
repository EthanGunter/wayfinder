
export class Err {
    stacks: string[] = ["call .withTraceDepth() for stacktrace"];
    private traceDepth: number | undefined;
    // private inheritanceDepth: number;
    /**
     * @param inheritanceDepth helps keep the stacktrace clean. -1 doesn't generate a stacktrace
     */
    constructor(private inheritanceDepth: number, public msg: string, public context?: any) {
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
                this.stacks = err.stack.split('\n').map(line => line.trim().replace("at ", ""));
            } else {
                // Skip the error frames and keep only the relevant code frames
                this.stacks = err.stack.split('\n').slice(this.inheritanceDepth + 1, this.inheritanceDepth + this.traceDepth + 1).map(line => line.trim().replace("at ", ""));
            }
        }
        return this;
    }

    /** Lets us hide irrelevant data when the object is thrown or .log()ed */
    private toJSON() {
        const cleaned: any = { ...this };
        delete cleaned.inheritanceDepth;
        delete cleaned.traceDepth;
        return cleaned;
    };
}

export class ArgumentError extends Err {
    constructor(argument: string, reason: string) {
        super(1, `ArgumentError: ${argument} invalid`, reason);
    }
}

export class NotFoundError extends Err {
    constructor(item: string, type: string = "Item") {
        super(1, `NotFoundError: ${type} NotFound`, item);
    }
}

export class ParseError extends Err {
    constructor(content: any, targetType: string) {
        super(1, `ParseError: Failed to parse content to ${targetType}`, content);
    }
}


export class IOError extends Err {
    constructor(mode: "Read" | "Delete", path: string, internalError: any);
    constructor(mode: "Write" | "Update", path: string, internalError: any, dataToWrite: any);
    constructor(mode: "Read" | "Write" | "Update" | "Delete", path: string, internalError: any, dataToWrite?: any) {
        let message = "IOError: "
        if (mode === "Read" || mode === "Delete") {
            message += `Failed to ${mode} ${path}`;
        } else {
            message += `Failed to ${mode} data to "${path}":\n${typeof dataToWrite === 'string' ? dataToWrite : JSON.stringify(dataToWrite, undefined, 2)}`
        }
        super(1, message, internalError);
    }
}

export class NotImplemented extends Err {
    constructor(methodName: string) {
        super(1, "Not Implemented", methodName);
    }
}