import { ParseError } from "$domain/errors";
import { tokenize } from "./tokenizer";
import type { ASTNode, Token, TokenType } from "./types";

export class Parser {
	private tokens: Token[];
	private pos = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	private current(): Token {
		return this.tokens[this.pos];
	}

	private consume(type: TokenType): Token {
		const token = this.current();
		if (token.type !== type) {
			throw new ParseError(
				`Expected ${type}, got ${token.type}`,
				'search expression',
				token.start,
				token.end
			);
		}
		this.pos++;
		return token;
	}

	private peek(type: TokenType): boolean {
		return this.current().type === type;
	}

	parse(): ASTNode {
		const result = this.expr();
		if (!this.peek('EOF')) {
			const token = this.current();
			throw new ParseError(
				'Unexpected token after expression',
				'search expression',
				token.start,
				token.end
			);
		}
		return result;
	}

	private expr(): ASTNode {
		return this.orExpr();
	}

	private orExpr(): ASTNode {
		let left = this.andExpr();

		while (this.peek('OR')) {
			const orToken = this.consume('OR');
			const right = this.andExpr();

			const start = left.start;
			const end = right.end;
			left = { type: 'or', left, right, start, end };
		}

		return left;
	}

	private andExpr(): ASTNode {
		let left = this.term();

		while (!this.peek('EOF') && !this.peek('RPAREN') && !this.peek('OR')) {
			if (this.peek('AND')) this.consume('AND');
			const right = this.term();
			const start = left.start;
			const end = right.end;
			left = { type: 'and', left, right, start, end };
		}

		return left;
	}

	private term(): ASTNode {
		if (this.peek('LPAREN')) {
			const l = this.consume('LPAREN');
			const child = this.expr();
			const r = this.consume('RPAREN');
			return { type: 'group', child, start: l.start, end: r.end };
		}

		if (this.peek('KVP')) {
			const token = this.consume('KVP');
			return {
				type: 'kvp',
				key: token.key!,
				op: token.op!,
				value: token.value,
				negated: token.negated || false,
				start: token.start,
				end: token.end,
			};
		}

		const token = this.current();
		throw new ParseError(
			`Expected expression, got ${token.type}`,
			'search expression',
			token.start,
			token.end
		);
	}
}

export function parseQuery(input: string): ASTNode {
	const tokens = tokenize(input);
	const parser = new Parser(tokens);
	return parser.parse();
}

