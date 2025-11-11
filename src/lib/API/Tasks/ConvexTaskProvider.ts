import { Err, NotImplementedError, NotAuthorizedError, ArgumentError } from "$domain/errors";
import { err, ok } from "$domain/result";
import { type CreateTaskParams, type Task, type UpdateTaskParams, type SystemAgnosticTask } from "$domain/models/task";
import { api as convexApi } from "$convex/_generated/api";
import type { Doc, Id } from "$convex/_generated/dataModel";
import { sharedConvexClient as client } from "$lib/API/ConvexClient";
import { createFetchableReadable as createFetchable, createQueryable } from "$lib/API/fetchableStore";
import type { ITasks, ITasksLocal } from "./seam-interfaces";

interface ExportedData {
	version: string;
	exportedAt: string;
	tasks: SystemAgnosticTask<string>[];
}


export const api: ITasks = {
	createTask: async ({ createDetail }) => {
		const res = await client.mutation(convexApi.tasks.createTask, { createDetail: convexifyCreateTaskDetails(createDetail) });

		if (!isConvexOk(res)) return err(res.error);

		return ok({
			oldId: res.value.oldId,
			newId: res.value.newId,
			affectedTasks: (Array.isArray(res.value.affectedTasks) ? res.value.affectedTasks : []).map((r) => r ? rowToTask(r) : null).filter((t): t is Task => Boolean(t))
		});
	},

	createTasks: async ({ createDetails }) => {
		const res = await client.mutation(convexApi.tasks.createTasks, { createDetails: createDetails.map(convexifyCreateTaskDetails) });
		if (isConvexOk(res)) {
			const v = res.value;
			const mapped = (Array.isArray(v.affectedTasks) ? v.affectedTasks : []).map((r) => r ? rowToTask(r) : null).filter((t): t is Task => Boolean(t));
			return ok({ updatedIds: new Map(v.updatedIds), affectedTasks: mapped });
		}
		return err(res.error as NotAuthorizedError);
	},

	getTask: ({ id }) =>
		createQueryable<{ id: string }, Task>(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getTask,
					{ id: params.id as Id<'tasks'> },
					(result: ConvexResponse<Doc<'tasks'>, Err>) => {
						if (isConvexOk(result)) {
							set({ status: "resolved", data: rowToTask(result.value) });
						} else {
							set({ status: "error", error: result.error });
						}
					},
					(error: Error) => {
						set({ status: "error", error: Err.wrap(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getTasks: ({ ids }) =>
		createQueryable<{ ids: string[] }, Task[]>(
			{ ids },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getTasks,
					{ ids: params.ids as Id<'tasks'>[] },
					(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
						if (isConvexOk(result)) {
							set({ status: "resolved", data: result.value.map(rowToTask) });
						} else {
							set({ status: "error", error: result.error });
						}
					},
					(error: Error) => {
						set({ status: "error", error: Err.wrap(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getAllUserTasks: ({ userId }) =>
		createQueryable<{ userId?: string }, Task[]>(
			{ userId },
			(params, set) => {
				let unsubscribe: (() => void) | null = null;
				let cancelled = false;

				// If userId is not provided, get current authenticated user
				const resolveUserId = async (): Promise<string | null> => {
					if (params.userId) {
						return params.userId;
					}
					try {
						const whoamiResult = await client.query(convexApi.users.whoami, {});
						if (whoamiResult && whoamiResult.authId) {
							return whoamiResult.authId;
						}
						return null;
					} catch (error) {
						return null;
					}
				};

				// Start async resolution of userId
				resolveUserId().then((resolvedUserId) => {
					if (cancelled || !resolvedUserId) {
						if (!resolvedUserId && !cancelled) {
							set({ status: "error", error: new NotAuthorizedError("Not authenticated") });
						}
						return;
					}

					unsubscribe = client.onUpdate(
						convexApi.tasks.getAllUserTasks,
						{ userId: resolvedUserId },
						(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
							if (cancelled) return;
							if (isConvexOk(result)) {
								set({ status: "resolved", data: result.value.map(rowToTask) });
							} else {
								set({ status: "error", error: result.error });
							}
						},
						(error: Error) => {
							if (cancelled) return;
							set({ status: "error", error: Err.wrap(error) });
						}
					);
				}).catch((error) => {
					if (cancelled) return;
					set({ status: "error", error: Err.wrap(error) });
				});

				return () => {
					cancelled = true;
					if (unsubscribe) {
						unsubscribe();
					}
				};
			}),

	updateTask: async (update: UpdateTaskParams) => {
		const res = await client.mutation(convexApi.tasks.updateTask, { update: convexifyTaskUpdate(update) });
		if (isConvexOk(res)) return ok(rowToTask(res.value));
		return err(res.error);
	},

	updateTasks: async ({ updates }) => {
		const res = await client.mutation(convexApi.tasks.updateTasks, { updates: updates.map(u => convexifyTaskUpdate(u)) });
		if (isConvexOk(res)) return ok(res.value.map(rowToTask));
		return err(res.error);
	},

	deleteTask: async ({ id }) => {
		const res = await client.mutation(convexApi.tasks.deleteTask, { id: id as Id<'tasks'> });
		if (isConvexOk(res)) return ok();
		return err(res.error);
	},

	deleteTasks: async ({ ids }) => {
		const res = await client.mutation(convexApi.tasks.deleteTasks, { ids: ids as Id<'tasks'>[] });
		return ok();
	},

	getChildrenOf: ({ id }) =>
		createQueryable(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getChildrenOf,
					{ id: params.id as Id<'tasks'> },
					(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
						if (isConvexOk(result)) {
							set({ status: "resolved", data: result.value.map(rowToTask) });
						} else {
							set({ status: "error", error: result.error });
						}
					},
					(error: Error) => {
						set({ status: "error", error: Err.wrap(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getParentsOf: ({ id }) =>
		createQueryable(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getParentsOf,
					{ id: params.id as Id<'tasks'> },
					(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
						if (isConvexOk(result)) {
							set({ status: "resolved", data: result.value.map(rowToTask) });
						} else {
							set({ status: "error", error: result.error });
						}
					},
					(error: Error) => {
						set({ status: "error", error: Err.wrap(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getSiblingsOf: ({ id }) =>
		createQueryable({ id }, (params, set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getSiblingsOf,
				{ id: params.id as Id<'tasks'> },
				(result: ConvexResponse<[Doc<'tasks'>, Doc<'tasks'>[]][], Err>) => {
					if (isConvexOk(result)) {
						const siblings = new Map(result.value.map(
							([parent, siblings]) => [rowToTask(parent), siblings.map(rowToTask)]
						));
						set({ status: "resolved", data: siblings });
					} else {
						set({
							status: "error", error: result.error
						});
					}
				},
				(error: Error) => {
					set({ status: "error", error: Err.wrap(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getRootTasks: () =>
		createFetchable((set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getRootTasks,
				{},
				(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
					if (isConvexOk(result)) {
						set({ status: "resolved", data: result.value.map(rowToTask) });
					} else {
						set({ status: "error", error: result.error });
					}
				},
				(error: Error) => {
					set({ status: "error", error: Err.wrap(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getTodaysTasks: () =>
		createFetchable((set) => {
			set({ status: "loading" });
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getTodaysTasks,
				{},
				(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
					if (isConvexOk(result)) {
						set({ status: "resolved", data: result.value.map(rowToTask) });
					} else {
						set({ status: "error", error: result.error });
					}
				},
				(error: Error) => {
					set({ status: "error", error: Err.wrap(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getPrioritizedTasks: (limit: number) =>
		createQueryable({ limit }, (params, set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getPrioritizedTasks,
				{ limit: params.limit },
				(result: ConvexResponse<Doc<'tasks'>[], Err>) => {
					if (isConvexOk(result)) {
						set({ status: "resolved", data: result.value.map(rowToTask) });
					} else {
						set({ status: "error", error: result.error });
					}
				},
				(error: Error) => {
					set({ status: "error", error: Err.wrap(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	searchTasks: async (_searchTerm: string) => {
		// const res = await client.query(api.tasks.searchTasks, { searchTerm });
		// return res; // Promise<Task[]>
		Err.throw(new NotImplementedError("api.searchTasks"));
	},
};

// Thin passthrough over the Convex provider. No optimistic/local behavior.
export const localApi: ITasksLocal = {
	// Creates remotely; returns newId for local contract
	createTask: async ({ createDetail }) => {
		const [res, e] = await api.createTask({ createDetail });
		if (e) return err(e);
		return ok(res.newId);
	},
	createTasks: async ({ createDetails }) => {
		const [res, e] = await api.createTasks({ createDetails });
		if (e) return err(e);
		// Prefer authoritative ids from affectedTasks if mapping is empty
		const mappedIds = res.updatedIds && res.updatedIds.size > 0
			? Array.from(res.updatedIds.values())
			: res.affectedTasks.map(t => t.id);
		return ok(mappedIds);
	},

	getTask: (params) => api.getTask(params),
	getTasks: (params) => api.getTasks(params),
	getAllUserTasks: (params) => api.getAllUserTasks(params),

	updateTask: async (params: UpdateTaskParams) => api.updateTask(params),
	updateTasks: async (params) => api.updateTasks(params),
	handleUpdateTasksResponse: async (_response) => { /* no-op */ },

	deleteTask: async (params) => api.deleteTask(params),
	deleteTasks: async (params) => api.deleteTasks(params),
	handleDeleteTasksResponse: async (_response) => { /* no-op */ },

	handleCreateTasksResponse: async (_response) => { /* no-op */ },
	handleMigrateResponse: async (_response) => { /* no-op */ },

	getChildrenOf: (params) => api.getChildrenOf(params),
	getParentsOf: (params) => api.getParentsOf(params),
	getSiblingsOf: (params) => api.getSiblingsOf(params),
	getRootTasks: () => api.getRootTasks(),
	getTodaysTasks: () => api.getTodaysTasks(),
	getPrioritizedTasks: (limit: number) => api.getPrioritizedTasks(limit),

	searchTasks: async (searchTerm: string) => api.searchTasks(searchTerm),

	exportData: async () => {
		const whoamiResult = await client.query(convexApi.users.whoami, {});
		if (!whoamiResult?.authId) {
			throw new NotAuthorizedError("Not authenticated");
		}

		const tasksResult = await client.query(convexApi.tasks.getAllUserTasks, { userId: whoamiResult.authId });
		if (!isConvexOk(tasksResult)) {
			const error = tasksResult as { ok: false; error: Err };
			throw error.error;
		}

		const tasks = tasksResult.value.map(rowToTask);
		const exportedTasks: SystemAgnosticTask<string>[] = tasks.map(task => ({
			id: task.id,
			userAuthId: task.userAuthId,
			type: task.type,
			title: task.title,
			content: task.content,
			status: task.status,
			parents: task.parents,
			children: task.children,
			todaysTask: task.todaysTask?.toISOString(),
			dueDate: task.dueDate?.toISOString(),
			created: task.created.toISOString(),
			lastEdit: task.lastEdit.toISOString(),
		}));

		const exportedData: ExportedData = {
			version: "0.0.0",
			exportedAt: new Date().toISOString(),
			tasks: exportedTasks,
		};

		return JSON.stringify(exportedData, null, 2);
	},

	importData: async ({ data, mode = "add" }) => {
		const whoamiResult = await client.query(convexApi.users.whoami, {});
		if (!whoamiResult?.authId) {
			throw new NotAuthorizedError("Not authenticated");
		}

		let parsed: ExportedData;
		try {
			parsed = JSON.parse(data);
		} catch (error) {
			throw new ArgumentError("Invalid JSON format", data, { cause: error });
		}

		if (!parsed.version || !parsed.tasks || !Array.isArray(parsed.tasks)) {
			throw new ArgumentError("Invalid export format: missing version or tasks", parsed);
		}

		// Version migration - currently only support 0.0.0
		if (parsed.version !== "0.0.0") {
			throw new ArgumentError(`Unsupported export version: ${parsed.version}. Expected 0.0.0`, parsed);
		}

		if (parsed.tasks.length == 0) return 0;

		// Convert ISO strings back to Date objects
		const tasksToImport: Task[] = parsed.tasks.map(task => ({
			...task,
			userAuthId: whoamiResult.authId, // Override with current user
			todaysTask: task.todaysTask ? new Date(task.todaysTask) : undefined,
			dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
			created: new Date(task.created),
			lastEdit: new Date(task.lastEdit),
		}));

		if (mode === "replace") {

			// Get all existing tasks and delete them
			const existingResult = await client.query(convexApi.tasks.getAllUserTasks, { userId: whoamiResult.authId });
			if (isConvexOk(existingResult) && existingResult.value.length > 0) {
				const existingIds = existingResult.value.map(row => row._id);
				await client.mutation(convexApi.tasks.deleteTasks, { ids: existingIds });
			}

			const [createResult, err] = await api.createTasks({ createDetails: tasksToImport });
			if (err) {
				throw err;
			}
			return createResult.affectedTasks.length;

		} else if (mode === "add") {
			// Remove all references to nodes that aren't in the "add" set
			const allIds = new Set(tasksToImport.map(t => t.id));
			for (const task of tasksToImport) {
				task.parents = task.parents?.filter(p => allIds.has(p)) ?? [];
				task.children = task.children?.filter(c => allIds.has(c)) ?? [];
			}

			const [createResult, err] = await api.createTasks({ createDetails: tasksToImport });
			if (err) {
				throw err;
			}
			return createResult.affectedTasks.length;

		} else if (mode === "attemptMerge") {
			Err.NotImplemented("attemptMerge import mode");
		}

		// Fallback (should never reach here due to type constraints, but satisfies TypeScript)
		return 0;
	},
};

export default localApi;



async function computeIncludedIds(seedIds: string[], ancestorDepth: number, descendantDepth: number): Promise<Set<string>> {
	const included: Set<string> = new Set(seedIds);
	const getMany = async (ids: string[]) => {
		if (ids.length === 0) return [] as Task[];
		const res = await client.query(convexApi.tasks.getTasks, { ids: ids as Id<'tasks'>[] });
		if (isConvexOk(res)) return res.value.map(rowToTask);
		return [] as Task[];
	};

	let up = [...seedIds];
	for (let d = 0; d < ancestorDepth && up.length; d++) {
		const tasks = await getMany(up);
		const next: string[] = [];
		for (const t of tasks) for (const pid of (t.parents ?? [])) if (!included.has(pid)) { included.add(pid); next.push(pid); }
		up = next;
	}

	let down = [...seedIds];
	for (let d = 0; d < descendantDepth && down.length; d++) {
		const tasks = await getMany(down);
		const next: string[] = [];
		for (const t of tasks) for (const cid of (t.children ?? [])) if (!included.has(cid)) { included.add(cid); next.push(cid); }
		down = next;
	}

	return included;
}

type ConvexResponse<T, E = unknown> = { ok: true; value: T } | { ok: false; error: E };
function isConvexOk<T, E>(res: ConvexResponse<T, E>): res is { ok: true; value: T } {
	return (res as any).ok === true;
}

export function convexifyCreateTaskDetails(dto: CreateTaskParams): Doc<"tasks"> {
	const convexified: Partial<Doc<"tasks">> = {
		...dto,
		created: dto.created instanceof Date ? dto.created.getTime() : dto.created,
		todaysTask: dto.todaysTask instanceof Date ? dto.todaysTask.getTime() : dto.todaysTask,
		dueDate: dto.dueDate instanceof Date ? dto.dueDate.getTime() : dto.dueDate,
		lastEdit: dto.lastEdit instanceof Date ? dto.lastEdit.getTime() : dto.lastEdit,
	};

	delete (convexified as Partial<Task>).created; // Remove Date object so we don't crash Convex
	return convexified as Doc<"tasks">;
}

function rowToTask(row: Doc<"tasks">): Task {
	return {
		...row,
		type: row.type!,
		id: row._id,
		created: new Date(row._creationTime),
		lastEdit: new Date(row.lastEdit),
		todaysTask: row.todaysTask ? new Date(row.todaysTask) : undefined,
		dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
	};
}

function convexifyTaskUpdate(update: UpdateTaskParams)/* : {
	update:
	{
		data?: any;
		relations?:
		{
			id: string;
			operation: "addChild" | "removeChild" | "addParent" | "removeParent";
		}[] | undefined;
		id: Id<"tasks">;
	};
} */ {
	return {
		...update,
		id: update.id as Id<'tasks'>,
		data: update.data ? {
			...update.data,
			todaysTask: update.data?.todaysTask ? update.data.todaysTask.getTime() : undefined,
			lastEdit: update.data?.lastEdit?.getTime(),
		} : undefined
	}

}
