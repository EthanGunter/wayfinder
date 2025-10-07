// convex/_types.ts
export type User = {
	id: string;                // BetterAuth user id
	display_name: string;
	avatar_url?: string;
	created_at: string;
	status: "active" | "deleted";
	features: string[];
	setting_overrides?: any;
  };
  
  export type Task = {
	id: string;
	user_id: string; // BetterAuth user id
	title: string;
	content?: string;
	status: number;
	todays_task?: string;
	priority?: number;
	parents?: string[];
	children?: string[];
	created: string;
	last_edit: string;
  };
  
  export type CreateTaskParams = Partial<Task> & Omit<Task,
	"created" | "last_edit" | "todays_task" | "status" | "parents" | "children"
  >;
  export type RelationChange = { id: string, operation: "addChild" | "removeChild" | "addParent" | "removeParent" };
  export type UpdateTaskParams = { id: string, data?: Partial<Task>, relations?: RelationChange[] };