import { ParseError } from "$domain/errors";
import { tokenize, type Token, type TokenType } from "./tokenizer";

export type ASTNode =
	| { type: 'kvp'; key: string; op: string; value: string; negated: boolean; start: number; end: number }
	| { type: 'and'; left: ASTNode; right: ASTNode }
	| { type: 'or'; left: ASTNode; right: ASTNode }
	| { type: 'group'; child: ASTNode };

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
			this.consume('OR');
			const right = this.andExpr();
			left = { type: 'or', left, right };
		}

		return left;
	}

	private andExpr(): ASTNode {
		let left = this.term();

		while (!this.peek('EOF') && !this.peek('RPAREN') && !this.peek('OR')) {
			if (this.peek('AND')) {
				this.consume('AND');
			}
			const right = this.term();
			left = { type: 'and', left, right };
		}

		return left;
	}

	private term(): ASTNode {
		if (this.peek('LPAREN')) {
			this.consume('LPAREN');
			const child = this.expr();
			this.consume('RPAREN');
			return { type: 'group', child };
		}

		if (this.peek('KVP')) {
			const token = this.consume('KVP');
			return {
				type: 'kvp',
				key: token.key!,
				op: token.op!,
				value: (token as any).kvValue,
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

function parseQuery(input: string): ASTNode {
	const tokens = tokenize(input);
	const parser = new Parser(tokens);
	return parser.parse();
}