import { err } from "neverthrow";

export class Err {
    constructor(public msg: string, public context?: any) { }
    log() { console.error(this.msg, this.context); }
}

export class NotFoundError extends Err {
    constructor(public item: string, public type: string = "Item") {
        super(`${type}NotFound: ${item}`);
    }
}

export class ParseError extends Err {
    constructor(public content: any, public targetType: string) {
        super(`Failed to parse content to ${targetType}:\n${content}`);
    }
}



export class JSError extends Err {
    constructor(public internalError: any) {
        super(`Internal Error: ${internalError?.message}`);
    }
}

export class IOError extends JSError {
    constructor(mode: "Read" | "Write" | "Update" | "Delete", path: string, public internalError: any) {
        super(`Failed to ${mode} on ${path}: ${internalError?.message}`);
    }
}

export class NotImplemented extends Err {
    constructor(methodName: string) {
        super(methodName);
        throw new Error(`${methodName} not implemented`);
    }
}