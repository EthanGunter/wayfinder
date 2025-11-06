import type { ParsedValue } from "./types";

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

class ParseError extends Error {
  constructor(message: string, public start: number, public end: number) {
    super(message);
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const patterns = {
    whitespace: /^\s+/,
    lparen: /^\(/,
    rparen: /^\)/,
    and: /^AND\b/i,
    or: /^OR\b/i,
    kvp: /^(\w+):(>|<|>=|<=|=)?(!)?(?:"([^"]*)"|([^\s()]+))/,
  };

  while (pos < input.length) {
    const remaining = input.slice(pos);
    
    let match = remaining.match(patterns.whitespace);
    if (match) {
      pos += match[0].length;
      continue;
    }

    match = remaining.match(patterns.lparen);
    if (match) {
      tokens.push({ type: 'LPAREN', value: '(', start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    match = remaining.match(patterns.rparen);
    if (match) {
      tokens.push({ type: 'RPAREN', value: ')', start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    match = remaining.match(patterns.and);
    if (match) {
      tokens.push({ type: 'AND', value: match[0], start: pos, end: pos + match[0].length });
      pos += match[0].length;
      continue;
    }

    match = remaining.match(patterns.or);
    if (match) {
      tokens.push({ type: 'OR', value: match[0], start: pos, end: pos + match[0].length });
      pos += match[0].length;
      continue;
    }

    match = remaining.match(patterns.kvp);
    if (match) {
      const [fullMatch, key, op, negation, quotedValue, unquotedValue] = match;
      tokens.push({
        type: 'KVP',
        value: fullMatch,
        key,
        op: op || '=',
        negated: !!negation,
        start: pos,
        end: pos + fullMatch.length,
      });
      (tokens[tokens.length - 1] as any).kvValue = quotedValue ?? unquotedValue;
      pos += fullMatch.length;
      continue;
    }

    throw new ParseError(
      `Unexpected character: '${remaining[0]}'`,
      pos,
      pos + 1
    );
  }

  tokens.push({ type: 'EOF', value: '', start: pos, end: pos });
  return tokens;
}

