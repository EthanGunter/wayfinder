import type { TaskData } from "./types";

export class TaskNode implements TaskData {
    id: string;
    filepath: string;
    title: string;
    created: string;
    content?: string;
    lastEdit?: string;

    constructor({
        id,
        filepath,
        title,
        content,
        created,
        lastEdit
    }: TaskData) {
        this.id = id;
        this.filepath = filepath;
        this.title = title;
        this.content = content;
        this.created = created;
        this.lastEdit = lastEdit;
    }
}

