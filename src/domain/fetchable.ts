import type { Err } from "./errors";

export type Fetchable<T> =
	| { status: "loading" }
	| { status: "error"; error: Err }
	| { status: "resolved"; value: T };