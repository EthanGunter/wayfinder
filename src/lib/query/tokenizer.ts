import type { Token, ComparisonOperator } from "./types";
import { ParseError } from "$domain/errors";

// ============================================================================
// Regex Patterns
// ============================================================================

/** Matches whitespace characters */
const REGEX_WHITESPACE = /\s/;

/** Matches logical operators: AND/&&/& or OR/||/| with optional trailing whitespace */
const REGEX_LOGICAL_OPERATOR = /^(AND|&&?|OR|\|\|?)\s*/i;

/** Matches AND operator variants: AND, &&, or & */
const REGEX_AND_OPERATOR = /^(AND|&&?)$/i;

/** Matches a key identifier: starts with letter/underscore, followed by alphanumeric/underscore */
const REGEX_KEY_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*/;

/** Matches comparison operators: >=, <=, ==, !=, ~=, >, < */
const REGEX_COMPARISON_OPERATOR = /^(>=|<=|==|!=|~=|>|<)/;

/** Matches regex pattern literals: /pattern/flags */
const REGEX_REGEX_LITERAL = /^\/(?:[^/\\]|\\.)+\/[gimsuvy]*/;

/** Matches quoted strings: "..." with escaped quotes */
const REGEX_QUOTED_STRING = /^"(?:[^"\\]|\\.)*"/;

/** Matches unquoted values: any characters except whitespace, parentheses, &, or | */
const REGEX_UNQUOTED_VALUE = /^[^\s()&|]+/;

// ============================================================================

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    // Skip whitespace
    if (REGEX_WHITESPACE.test(input[pos])) {
      pos++;
      continue;
    }

    const remaining = input.slice(pos);

    // Parentheses
    if (remaining[0] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', start: pos, end: pos + 1 });
      pos++;
      continue;
    }
    if (remaining[0] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    // Logical operators: AND/&&/& or OR/||/|
    const logicalMatch = remaining.match(REGEX_LOGICAL_OPERATOR);
    if (logicalMatch) {
      const op = logicalMatch[0];
      const type = REGEX_AND_OPERATOR.test(op) ? 'AND' : 'OR';
      tokens.push({ type, value: type, start: pos, end: pos + op.length });
      pos += op.length;
      continue;
    }

    // Try to parse KVP
    const kvpResult = parseKVP(input, pos);
    if (kvpResult) {
      tokens.push(kvpResult.token);
      pos = kvpResult.end;
      continue;
    }

    throw new ParseError(
      `Unexpected character '${remaining[0]}'`,
      'search expression',
      pos,
      pos + 1
    );
  }

  tokens.push({ type: 'EOF', value: '', start: pos, end: pos });
  return tokens;
}

function parseKVP(input: string, start: number): { token: Token; end: number } | null {
  let pos = start;

  // Match key
  const keyMatch = input.slice(pos).match(REGEX_KEY_IDENTIFIER);
  if (!keyMatch) return null;

  const key = keyMatch[0];
  pos += key.length;

  // Skip whitespace
  while (pos < input.length && REGEX_WHITESPACE.test(input[pos])) pos++;

  // Match operator (longest first)
  const opMatch = input.slice(pos).match(REGEX_COMPARISON_OPERATOR);
  const op: ComparisonOperator = opMatch ? (opMatch[0] as ComparisonOperator) : '==';
  if (opMatch) {
    pos += opMatch[0].length;
    // Skip whitespace after operator
    while (pos < input.length && REGEX_WHITESPACE.test(input[pos])) pos++;
  }

  // Parse value
  const valueResult = parseValue(input, pos);
  
  return {
    token: {
      type: 'KVP',
      key,
      op,
      value: valueResult.value,
      start,
      end: valueResult.end
    },
    end: valueResult.end
  };
}

function parseValue(input: string, start: number): { value: string | string[]; end: number } {
  let pos = start;

  // Array: [item1, item2, ...]
  if (input[pos] === '[') {
    return parseArray(input, pos);
  }

  // Regex: /pattern/flags
  const regexMatch = input.slice(pos).match(REGEX_REGEX_LITERAL);
  if (regexMatch) {
    return { value: regexMatch[0], end: pos + regexMatch[0].length };
  }

  // Quoted string: "..."
  const quotedMatch = input.slice(pos).match(REGEX_QUOTED_STRING);
  if (quotedMatch) {
    return { value: quotedMatch[0], end: pos + quotedMatch[0].length };
  }

  // Unquoted value: stop at whitespace, logical ops, or parens
  // Include range (..), tolerance (±, +/-), and other value operators
  const unquotedMatch = input.slice(pos).match(REGEX_UNQUOTED_VALUE);
  if (unquotedMatch) {
    return { value: unquotedMatch[0], end: pos + unquotedMatch[0].length };
  }

  // Empty value (for implicit ==)
  return { value: '', end: pos };
}

function parseArray(input: string, start: number): { value: string[]; end: number } {
  let pos = start + 1; // skip [
  const items: string[] = [];
  let current = '';
  let inQuotes = false;

  while (pos < input.length) {
    const char = input[pos];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      pos++;
    } else if (char === ',' && !inQuotes) {
      if (current.trim()) items.push(current.trim());
      current = '';
      pos++;
    } else if (char === ']' && !inQuotes) {
      if (current.trim()) items.push(current.trim());
      return { value: items, end: pos + 1 };
    } else {
      current += char;
      pos++;
    }
  }

  throw new ParseError('Unclosed array', 'array', start, pos);
}