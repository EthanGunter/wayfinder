/**
 * Project-specific data embedded in nodes
 * Projects are organizational containers that group related tasks
 */

import type { IAppNode, AppData } from "./node";

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
    uiPrefs?: {
        // Engagement feature flags
        showStreak?: boolean;
        showVelocity?: boolean;
        showMomentumScore?: boolean;
        showNextAction?: boolean;
        showMicroWins?: boolean;
    };
}

export enum ProjectStatus {
    active = 0,
    archived = 1,
    // Future statuses can be added here
}

export function isProjectActive(data: ProjectData<Date | number>): boolean {
    return data.status === ProjectStatus.active;
}

//#region Project Update Types

type StrippedNodeParams<DataType, TimeFormat = Date> = Partial<Omit<IAppNode<AppData<TimeFormat>, TimeFormat>, "data" | "id">> & Omit<DataType, "type">;

type ProjectUpdate<TimeFormat = Date> = Partial<ProjectData<TimeFormat>>
    & {
        addChildren?: string[];
        removeChildren?: string[];
    }

export type UpdateProjectParams<TimeFormat = Date> = { id: string; } & Partial<StrippedNodeParams<ProjectUpdate<TimeFormat>, TimeFormat>>;

//#endregion

