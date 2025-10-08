import { type Task } from "$domain/models/task";
import { type Doc } from "./_generated/dataModel";


//#region Mapping Utility

function rowToTask(row: Doc<"tasks">): Task {
	return {
		id: row._id,
		userAuthId: row.userAuthId,
		title: row.title,
		content: row.content ?? undefined,
		status: row.status,
		todaysTask: row.todaysTask ? new Date(row.todaysTask) : undefined,
		priority: row.priority ?? 0,
		parents: row.parents ?? [],
		children: row.children ?? [],
		created: new Date(row._creationTime),
		lastEdit: new Date(row.lastEdit),
	};
}

function taskToRow(task: Task): Omit<Doc<"tasks">, "_id"> {
	return {
		userAuthId: task.userAuthId,
		title: task.title,
		content: task.content ?? undefined,
		status: task.status,
		todaysTask: task.todaysTask?.getTime() ?? undefined,
		priority: task.priority ?? 0,
		parents: task.parents ?? [],
		children: task.children ?? [],
		_creationTime: task.created.getTime(),
		lastEdit: task.lastEdit.getTime(),
	};
}


// Domain -> DB insert (when you generate authoritative IDs server-side)
function newTaskDbDoc(params: {
	id: string;
	userId: string;
	title: string;
	content?: string;
	priority?: number;
	parents?: string[];
	children?: string[];
	nowISO: string;
}) {
	return {
		id: params.id,
		user_auth_id: params.userId,
		title: params.title,
		content: params.content,
		status: 0,
		todays_task: undefined,
		priority: params.priority ?? 0,
		parents: params.parents ?? [],
		children: params.children ?? [],
		created: params.nowISO,
		last_edit: params.nowISO,
	};
}

// Partial patch builder for updates: domain-ish input -> DB patch
function buildTaskPatch(current: Doc<"tasks">, input: {
	data?: Partial<Task>;
	relations?: { id: string; operation: "addChild" | "removeChild" | "addParent" | "removeParent" }[];
}) {
	// start with existing db values
	let parents = [...(current.parents ?? [])];
	let children = [...(current.children ?? [])];

	for (const rel of input.relations ?? []) {
		switch (rel.operation) {
			case "addChild": if (!children.includes(rel.id)) children.push(rel.id); break;
			case "removeChild": children = children.filter(id => id !== rel.id); break;
			case "addParent": if (!parents.includes(rel.id)) parents.push(rel.id); break;
			case "removeParent": parents = parents.filter(id => id !== rel.id); break;
		}
	}

	const patch: Partial<Doc<"tasks">> = { lastEdit: new Date().getTime() };

	// map domain fields to db fields
	const d = input.data ?? {};
	if (d.title) patch.title = d.title!;
	if (d.content) patch.content = d.content;
	if (d.status) patch.status = d.status!;
	if (d.todaysTask) patch.todaysTask = d.todaysTask.getTime();
	if (d.priority) patch.priority = d.priority;
	if ((input.relations ?? []).length > 0) {
		patch.parents = parents;
		patch.children = children;
	}

	return patch;
}

//#endregion