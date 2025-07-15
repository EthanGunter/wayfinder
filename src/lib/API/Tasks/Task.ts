import { ParseError } from "$lib/Errors";
import { Result, err, ok } from "neverthrow";
import yaml from 'js-yaml'
import type { CreateTaskDTO, PopulatedTaskDTO } from "./types";

export interface TaskData {
    id: string,
    // filepath?: string // TODO I'd eventually like to make Wayfinder local-plain-text-first, but that's a future feature
    title: string,
    content?: string,
    status: TaskStatus,
    todays_task: boolean,
    priority?: number,
    /** 
     * Tasks that depend on this one's completion.
    */
    parents: string[]
    /** 
     * This task's prequisite[s].
    */
    children: string[]
    created: string, // ISO Timestamp
    last_edit: string, // ISO Timestamp
}

export enum TaskStatus {
    incomplete = 0,
    complete = 1,
}

export function isTask(value: any): value is Task {
    return typeof value === 'object'
        && typeof value.id === 'string'
        && typeof value.filepath === 'string'
        && typeof value.title === 'string'
        && typeof value.created === 'string'
        && typeof value.last_edit === 'string'
        && typeof value.todays_task === 'boolean'
        && typeof value.parents === 'object'
        && typeof value.children === 'object'
        ;
}

export class Task implements TaskData {
    id: string;
    filepath?: string;
    title: string;
    content?: string;
    status: TaskStatus;
    todays_task: boolean;
    priority?: number;
    parents: string[];
    children: string[];
    created: string;
    last_edit: string;

    public get completed(): boolean {
        return this.status === TaskStatus.complete;
    }

    constructor({
        id,
        filepath,
        title,
        content,
        status = TaskStatus.incomplete,
        todays_task: todaysTask = false,
        priority = 0,
        created = new Date().toISOString(),
        last_edit: last_edit = new Date().toISOString(),
        parents = [],
        children = []
    }: CreateTaskDTO) {
        this.id = id ?? "NO-ID";
        this.title = title;
        this.content = content;
        this.filepath = filepath ?? `${title}.md`;
        this.status = status;
        this.todays_task = todaysTask;
        this.priority = priority;
        this.created = created;
        this.last_edit = last_edit;
        this.parents = parents;
        this.children = children;
    }

    static populateDTO(dto: CreateTaskDTO): PopulatedTaskDTO {
        return {
            priority: dto.priority ?? 0,
            title: dto.title,
            content: dto.content,
            filepath: dto.filepath ?? `${dto.title}.md`,
            status: dto.status ?? TaskStatus.incomplete,
            todays_task: dto.todays_task ?? false,
            created: dto.created ?? new Date().toISOString(),
            last_edit: dto.last_edit ?? new Date().toISOString(),
            parents: dto.parents ?? [],
            children: dto.children ?? [],
        }
    }

    // Helper: Convert TaskData to markdown string
    static toMarkdown(task: TaskData): string {
        const { content, /* filepath, */ ...meta } = task;
        return `---\n${yaml.dump(meta)}---\n${content ?? ''}`;
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

