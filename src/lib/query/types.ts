export type ASTNode = { start: number; end: number } &
	(
		| { type: 'kvp'; key: string; op: string; value: ParsedValue | ParsedValue[]; negated: boolean; }
		| { type: 'and'; left: ASTNode; right: ASTNode; }
		| { type: 'or'; left: ASTNode; right: ASTNode; }
		| { type: 'group'; child: ASTNode; }
	);

export type TokenType = 'LPAREN' | 'RPAREN' | 'AND' | 'OR' | 'KVP' | 'EOF';

export interface Token {
	type: TokenType;
	value: ParsedValue | ParsedValue[];
	key?: string;
	op?: string;
	negated?: boolean;  // For !value
	start: number;
	end: number;
}

export type QueryOperator = '=' | '>' | '<' | '>=' | '<=' | '~' | '/' | '?';
export type DateValue = Date | { type: 'date-range'; rangeTop: Date; rangeBottom: Date }
export type NumberValue = number | { type: 'number-range'; rangeTop: number; rangeBottom: number }
export type ParsedValue =
	| string
	| NumberValue
	| DateValue
	| boolean

export type ValueParser<T extends ParsedValue> = (value: string) => T;

export type FieldMatcher<TEntity, T extends ParsedValue> = (entity: TEntity, op: QueryOperator, parsedValue: T) => boolean;

export interface FieldHandler<TEntity, T extends ParsedValue> {
	parseValue: ValueParser<T>;
	matches: FieldMatcher<TEntity, T>;
	autocomplete?: (value: string) => string[];
}

/**
 * Helper function to create a type-safe field handler.
 * Ensures parseValue returns the same type that matches expects.
 */
export function fieldHandler<TEntity, T extends ParsedValue>(handler: FieldHandler<TEntity, T>): FieldHandler<TEntity, any> {
	return handler;
}

/**
 * Registry type that allows each field to have its own specific ParsedValue type.
 * Individual handlers are type-safe via fieldHandler<T>, but the registry
 * accepts any FieldHandler<ParsedValue> to allow heterogeneous collections.
 */
export type FieldRegistry<TEntity> = Record<string, FieldHandler<TEntity, ParsedValue>>;

