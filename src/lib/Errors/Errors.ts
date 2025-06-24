import { err } from "neverthrow";

export class Err {
    constructor(public msg: string) { }
    log() { console.error(this.msg); }
}

export class NotFoundError extends Err {
    constructor(public item: string, public type: string = "Item") {
        super(`${type}NotFound: ${item}`);
    }
}

export class ParseError extends Err {
    constructor(public content: string, public targetType: string) {
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