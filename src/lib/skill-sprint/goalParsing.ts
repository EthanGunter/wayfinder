export function extractGoalStatement(input: string): string | null {
	const pattern = /<goal>([\s\S]*?)<\/goal>/g;
	let match: RegExpExecArray | null = null;
	let last: string | null = null;

	while ((match = pattern.exec(input)) !== null) {
		last = match[1] ?? null;
	}

	if (last === null) return null;
	const trimmed = last.trim();
	return trimmed.length > 0 ? trimmed : null;
}
