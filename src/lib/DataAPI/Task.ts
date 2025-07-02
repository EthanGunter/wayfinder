import { ParseError } from "$lib/Errors";
import { Result, err, ok } from "neverthrow";
import yaml from 'js-yaml'
import type { CreateTaskDTO } from "./types";

export interface TaskData {
    id: string,
    filepath: string
    title: string,
    created: string, // ISO Timestamp
    status: TaskStatus
    content?: string,
    lastEdit?: string, // ISO Timestamp
    /** 
     * Tasks that can't be completed until this one is.
     * Effectively the node's parent
    */
    dependant?: string //TODO this might become an array in the future
    /** 
     * This task's prequisite[s].
     * Effectively the node's children
    */
    dependsOn?: string[]
}

export enum TaskStatus {
    incomplete = 0,
    complete = 1,
}

export class Task implements TaskData {
    id: string;
    filepath: string;
    title: string;
    status: TaskStatus;
    created: string;
    content?: string;
    lastEdit?: string;
    dependant?: string;
    dependsOn?: string[];

    public get completed(): boolean {
        return this.status === TaskStatus.complete;
    }

    constructor({
        id,
        filepath,
        title,
        content,
        created,
        lastEdit,
        status
    }: CreateTaskDTO) {
        this.id = id ?? "NO-ID";
        this.title = title;
        this.content = content;
        this.filepath = filepath ?? `${title}.md`;
        this.status = status ?? TaskStatus.incomplete;
        this.created = created ?? new Date().toISOString();
        this.lastEdit = lastEdit ?? new Date().toISOString();
    }

    // Helper: Convert TaskData to markdown string
    static toMarkdown(task: TaskData): string {
        const { content, filepath, ...meta } = task;
        return `---\n${yaml.dump(meta)}---\n${content}`;
    }

    // Helper: Parse markdown string to TaskData
    /**
     * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
     */
    static fromMarkdown(md: string, filepath: string): Result<Task, ParseError> {
        const match = md.match(/^---\n([\s\S]+?)---\n([\s\S]*)$/);
        if (!match) {
            return err(new ParseError(md, "TaskNode"));
        }

        const meta = yaml.load(match[1]) as Omit<Task, 'content'>;
        return ok({ ...meta, filepath, content: match[2].trim() });
    }
}

