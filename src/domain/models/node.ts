/**
 * Core Node interface - represents a graph node with embedded data
 * Separates graph structure (parents/children/timestamps) from content (T)
 */
export interface INode<DataType, TimeFormat = Date> {
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
    data: DataType;
}

/**
 * System-agnostic node type that works with both Date (client) and number (Convex) timestamps
 * @template TData - The embedded data type (ProjectData, TaskData, etc.)
 * @template TTimestamp - Date (client) or number (server)
 */
export interface INodeBase<TData, TTimestamp = Date> {
    id: string;
    userAuthId: string;
    parents: string[];
    children: string[];
    created: TTimestamp;
    lastEdit: TTimestamp;
    data: TData;
}
