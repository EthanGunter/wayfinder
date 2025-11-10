import { Err } from "$domain/errors";

export type ASTNode = { start: number; end: number } &
	(
		| { type: 'kvp'; key: string; op: ComparisonOperator; value: string | string[] }
		| { type: 'and'; left: ASTNode; right: ASTNode }
		| { type: 'or'; left: ASTNode; right: ASTNode }
		| { type: 'group'; child: ASTNode }
	);

// Tokenization types (also raw strings)
export type TokenType = 'LPAREN' | 'RPAREN' | 'AND' | 'OR' | 'KVP' | 'EOF';

export interface Token {
	type: TokenType;
	value: string | string[];
	key?: string;
	op?: string;
	start: number;
	end: number;
}

// Operators
export type ComparisonOperator = '==' | '!=' | '>=' | '<=' | '>' | '<' | '~=';
export type ValueOperator = '[]' | '..' | '+' | '-';

export function compareOps<const T extends readonly ComparisonOperator[]>(...o: T): T {
	return o;
}

export function valueOps<const T extends readonly ValueOperator[]>(...o: T): T {
	return o;
}

// Value types
export type Single<T> = { kind: 'single'; data: T };
export type Range<T> = { kind: 'range'; lower: T; upper: T; inclusive?: boolean };
export type MultiValue<T> = Single<T> | Range<T>;

// Check if '..' OR '[]' exists in the tuple
type HasMultiOps<VOps extends readonly ValueOperator[]> =
	'..' extends VOps[number] ? true :
	'[]' extends VOps[number] ? true :
	false;

// Check if '+' OR '-' exists in the tuple
type HasArithOps<VOps extends readonly ValueOperator[]> =
	'+' extends VOps[number] ? true :
	'-' extends VOps[number] ? true :
	false;

// Determine value type based on operators
type ValueType<VOps extends readonly ValueOperator[] | undefined, T> =
	VOps extends readonly ValueOperator[]
	? HasMultiOps<VOps> extends true
	? MultiValue<T>
	: Single<T>
	: Single<T>;

export type FieldMatcher<
	TEntity,
	T,
	TOp extends ComparisonOperator,
	VOps extends readonly ValueOperator[] | undefined
> = (
	entity: TEntity,
	op: TOp,
	value: ValueType<VOps, T>
) => boolean;

type ArithRequirement<VOps extends readonly ValueOperator[] | undefined, T> =
	VOps extends readonly ValueOperator[]
	? HasArithOps<VOps> extends true
	? { arith: { add: (a: T, b: T) => T; sub: (a: T, b: T) => T } }
	: { arith?: { add?: (a: T, b: T) => T; sub?: (a: T, b: T) => T } }
	: { arith?: { add?: (a: T, b: T) => T; sub?: (a: T, b: T) => T } };

export type FieldHandler<
	TEntity,
	COps extends readonly ComparisonOperator[],
	VOps extends readonly ValueOperator[] | undefined,
	T = unknown
> = {
	operators: COps;
	valueOps: VOps;
	cardinality?: 'single' | 'array';
	transformValue: (raw: string) => T;
	matches: FieldMatcher<TEntity, T, COps[number], VOps>;
	autocomplete?: (value: string) => string[];
} & ArithRequirement<VOps, T>;

export function fieldHandler<
	TEntity,
	COps extends readonly ComparisonOperator[],
	VOps extends readonly ValueOperator[] | undefined,
	T
>(handler: FieldHandler<TEntity, COps, VOps, T>): FieldHandler<TEntity, COps, VOps, T> {
	return handler;
}

// Registry accepts handlers with any valid operator subsets
export type FieldRegistry<TEntity> = Record<
	string,
	FieldHandler<TEntity, any, any, any>
>;

/** Value transform error */
export class ValueTransformError extends Err {
	constructor(public messageForUser: string, devMessage?: string, cause?: unknown) {
		super("ValueTransformError", messageForUser, { messageForDev: devMessage, cause });
	}
}