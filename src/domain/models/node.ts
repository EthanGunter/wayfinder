import type { ProjectData } from "./project";
import type { TaskData } from "./task";

export type AppData<T = Date> = TaskData<T> | ProjectData<T>;

export type AppNode<TimeFormat = Date> = IAppNode<AppData<TimeFormat>, TimeFormat>;

/**
 * Core Node interface - represents a graph node with embedded data
 * Separates graph structure (parents/children/timestamps) from content (T)
 */
export interface IAppNode<TData extends AppData<TimeFormat>, TimeFormat = Date> {
    // Indexing
    id: string;
    userAuthId: string;

    // Graph Structure
    /** 
     * Tasks that depend on this one's completion.
     */
    parents: string[];
    /** 
     * This task's prerequisite[s].
     */
    children: string[];

    // Metadata
    created: TimeFormat;
    lastEdit: TimeFormat;

    // Content - discriminated union of ProjectData, TaskData, etc.
    data: TData;
}

