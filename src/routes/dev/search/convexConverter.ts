import type { ASTNode } from "./parser";

// Example field specs for validation
const QUERY_FIELDS = {
	status: { type: 'enum', values: ['complete', 'incomplete'] },
	priority: { type: 'number' },
	title: { type: 'string' },
	dueDate: { type: 'date' },
	isTodaysTask: { type: 'boolean' },
	parents: { type: 'array' },
} as const;

type QueryKey = keyof typeof QUERY_FIELDS;

// Simplified Convex filter builder
function astToConvexFilter(node: ASTNode): any {
	switch (node.type) {
		case 'kvp':
			return buildKVPFilter(node.key, node.op, node.value, node.negated);

		case 'and':
			return {
				$and: [
					astToConvexFilter(node.left),
					astToConvexFilter(node.right)
				]
			};

		case 'or':
			return {
				$or: [
					astToConvexFilter(node.left),
					astToConvexFilter(node.right)
				]
			};

		case 'group':
			return astToConvexFilter(node.child);
	}
}

function buildKVPFilter(key: string, op: string, value: string, negated: boolean): any {
	const fieldSpec = QUERY_FIELDS[key as QueryKey];
	if (!fieldSpec) {
		throw new Error(`Unknown field: ${key}`);
	}

	// Simple value parsing (expand this for dates, etc.)
	let parsedValue: any = value;
	if (fieldSpec.type === 'number') {
		parsedValue = parseFloat(value);
	} else if (fieldSpec.type === 'boolean') {
		parsedValue = value === 'true' || value === '1';
	}

	// Build filter object
	let filter: any = {};

	switch (op) {
		case '=':
			filter[key] = parsedValue;
			break;
		case '>':
			filter[key] = { $gt: parsedValue };
			break;
		case '<':
			filter[key] = { $lt: parsedValue };
			break;
		case '>=':
			filter[key] = { $gte: parsedValue };
			break;
		case '<=':
			filter[key] = { $lte: parsedValue };
			break;
	}

	if (negated) {
		return { $not: filter };
	}

	return filter;
}