/**
 * Project-specific data embedded in nodes
 * Projects are organizational containers that group related tasks
 */

/**
 * System-agnostic project data type
 * @template T - Any type that can be converted to Date() for timestamps
 */
export interface ProjectData<T = Date> {
    type: "project";
    title: string;
    content?: string;
    status: ProjectStatus;
    dueDate?: T;
}

export enum ProjectStatus {
    active = 0,
    archived = 1,
    // Future statuses can be added here
}

export function isProjectActive(data: ProjectData<Date | number>): boolean {
    return data.status === ProjectStatus.active;
}

