// convex/lib/map.ts
import type { Doc } from "./_generated/dataModel";
import { Task, User } from "$domain/data-types";

// DB row -> domain
export function toDomainUser(row: Doc<"users">): User {
	return {
		id: row.authId,
		display_name: row.display_name,
		avatar_url: row.avatar_url ?? undefined,
		created_at: row.created_at,
		status: (row.status ?? "active") as User["status"],
		features: row.features ?? [],
		setting_overrides: row.setting_overrides,
	};
}

export function toDomainTask(row: Doc<"tasks">): Task {
	return {
		id: row._id,
		user_id: row.user_auth_id,
		title: row.title,
		content: row.content ?? undefined,
		status: row.status,
		todays_task: row.todays_task ?? undefined,
		priority: row.priority ?? 0,
		parents: row.parents ?? [],
		children: row.children ?? [],
		created: row.created,
		last_edit: row.last_edit,
	};
}

// Domain -> DB insert (when you generate authoritative IDs server-side)
export function newTaskDbDoc(params: {
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
export function buildTaskPatch(current: Doc<"tasks">, input: {
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

	const patch: Partial<Doc<"tasks">> = { last_edit: new Date().toISOString() };

	// map domain fields to db fields
	const d = input.data ?? {};
	if ("title" in d) patch.title = d.title!;
	if ("content" in d) patch.content = d.content;
	if ("status" in d) patch.status = d.status!;
	if ("todays_task" in d) patch.todays_task = d.todays_task;
	if ("priority" in d) patch.priority = d.priority;
	if ((input.relations ?? []).length > 0) {
		patch.parents = parents;
		patch.children = children;
	}

	return patch;
}