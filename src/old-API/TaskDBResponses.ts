import Task from "@models/task";

export interface GetTasksResponse {
    tasks: Task[];
    failedTasks: string[];
}