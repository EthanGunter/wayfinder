import yaml from 'js-yaml'
import { err, ok, type Result } from 'neverthrow';
import type { TaskData } from './types';
import { ParseError } from '$lib/Errors';
// Helper: Convert TaskData to markdown string
export function nodeToMarkdown(node: TaskData): string {
    const { content, ...meta } = node;
    return `---\n${yaml.dump(meta)}---\n${content}`;
}

// Helper: Parse markdown string to TaskData
/**
 * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
 */
export function markdownToNode(md: string): Result<TaskData, ParseError> {
    const match = md.match(/^---\n([\s\S]+?)---\n([\s\S]*)$/);
    if (!match) {
        return err(new ParseError(md, "TaskNode"));
    }

    const meta = yaml.load(match[1]) as Omit<TaskData, 'content'>;
    return ok({ ...meta, content: match[2].trim() });
}