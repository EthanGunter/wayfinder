import { ParseError, type Result } from "$lib/Errors";
import { err, ok } from "neverthrow";
import yaml from 'js-yaml'
import type { CreateTaskParams, PopulatedTaskDTO } from "./types";
import { v4 } from "uuid";

export interface Task {
    id: string,
    user_id: string,
    // filepath?: string // TODO I'd eventually like to make Wayfinder local-plain-text-first, but that's a future feature
    title: string,
    content?: string,
    status: TaskStatus,
    todays_task?: string, // ISO Timestamp
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
        // && typeof value.filepath === 'string'
        && typeof value.title === 'string'
        && typeof value.created === 'string'
        && typeof value.last_edit === 'string'
        && (value.todays_task === undefined || typeof value.todays_task === 'string')
        && typeof value.parents === 'object'
        && typeof value.children === 'object'
        ;
}

export function isTaskCompleted(task: Task): boolean {
    return task.status === TaskStatus.complete;
}

export function createTask(params: CreateTaskParams): Task {
    const {
        id,
        user_id,
        title,
        content,
        status = TaskStatus.incomplete,
        todays_task,
        priority = 0,
        created = new Date().toISOString(),
        last_edit = new Date().toISOString(),
        parents = [],
        children = [],
    } = params;
    return {
        id: id ?? v4(),
        user_id: user_id,
        title: title,
        content,
        status,
        todays_task,
        priority,
        created,
        last_edit,
        parents,
        children,
    };
}

export function taskEquals(a: Task, b: Task, ignoreId: boolean = false): boolean {
    if (!ignoreId && a.id !== b.id) return false;
    return a.user_id === b.user_id
        && a.title === b.title
        && a.content === b.content
        && a.status === b.status
        && a.priority === b.priority
        && a.parents === b.parents
        && a.children === b.children
        && a.created === b.created;
    // && a.last_edit === b.last_edit // This might cause change between checks on server and local
}

export function populateTaskDTO(dto: CreateTaskParams): PopulatedTaskDTO {
    const populated = {
        id: dto.id ?? v4(),
        user_id: dto.user_id,
        priority: dto.priority ?? 0,
        title: dto.title,
        content: dto.content,
        // filepath: dto.filepath ?? `${dto.title}.md`,
        status: dto.status ?? TaskStatus.incomplete,
        todays_task: dto.todays_task,
        created: dto.created ?? new Date().toISOString(),
        last_edit: dto.last_edit ?? new Date().toISOString(),
        parents: dto.parents ?? [],
        children: dto.children ?? [],
    };
    return populated;
}

export function toMarkdown(task: Task): string {
    const { content, /* filepath, */ ...meta } = task;
    return `---\n${yaml.dump(meta)}---\n${content ?? ''}`;
}

/**
 * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
 */
export function fromMarkdown(md: string, filepath: string): Result<Task, ParseError> {
    const match = md.match(/^---\n([\s\S]+?)---\n([\s\S]*)$/);
    if (!match) {
        return err(new ParseError(md, "TaskNode"));
    }
    const meta = yaml.load(match[1]) as Omit<Task, 'content'>;
    return ok({ ...(meta as any), filepath, content: match[2].trim() });
}

