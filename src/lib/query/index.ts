/** Query evaluator for matching entities against AST expressions */
export { QueryEvaluator } from './evaluator';

/** String comparison functions for query matching */
export { compareString } from './matchers';
export { compareNumeric } from './matchers';
export { compareDate } from './matchers';

/** Query parser for converting string input to AST */
export { Parser, parseQuery } from './parser';

/** Query tokenizer for breaking input into tokens */
export { tokenize } from './tokenizer';

/** Query AST types, operators, and field handler utilities */
export type {
	ASTNode,
	Token,
	TokenType,
	ComparisonOperator,
	ValueOperator,
	Single,
	Range,
	MultiValue,
	FieldMatcher,
	FieldHandler,
	FieldRegistry,
} from './types';
export { compareOps, valueOps, fieldHandler, ValueTransformError } from './types';

/** Value parsing utilities for collections, ranges, and tolerances */
export {
	parseCollectionExpression,
	evaluateCollectionExpression,
	parseRange,
	parseTolerance,
	coerceToleranceToRange,
} from './valueParsers';

/** Value transformation utilities */
export { parseDateValue } from './valueTransformers';
