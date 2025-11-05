import { Err, NotImplementedError, type NotAuthorizedError } from "$domain/errors";
import { err, ok } from "$domain/result";
import { TaskStatus, type CreateTaskParams, type PopulatedTaskDTO, type Task, type TaskDelta, type UpdateTaskParams } from "$domain/models/task";
import { api as convexApi } from "$convex/_generated/api";
import type { Doc, Id } from "$convex/_generated/dataModel";
import { sharedConvexClient as client } from "$lib/API/ConvexClient";
import { createFetchableReadable as createFetchable, createQueryable } from "$lib/API/fetchableStore";
import type { ITasks, ITasksLocal } from "./seam-interfaces";


export const api: ITasks = {
	createTask: async ({ createDetail }) => {
		const res = await client.mutation(convexApi.tasks.createTask, { createDetail: convexifyTaskDetails(createDetail) });

		if (!isConvexOk(res)) return err(res.error);

		return ok({
			oldId: res.value.oldId,
			newId: res.value.newId,
			affectedTasks: (Array.isArray(res.value.affectedTasks) ? res.value.affectedTasks : []).map((r) => r ? rowToTask(r) : null).filter((t): t is Task => Boolean(t))
		});
	},

	createTasks: async ({ createDetails }) => {
		const res = await client.mutation(convexApi.tasks.createTasks, { createDetails: createDetails.map(convexifyTaskDetails) });
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
		createQueryable<{ userId: string }, Task[]>(
			{ userId },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getAllUserTasks,
					{ userId: params.userId },
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

	exportData: async () => { Err.NotImplemented('exportData'); },
	importData: async () => { Err.NotImplemented('exportData'); },
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

export function convexifyTaskDetails(dto: CreateTaskParams): {
	userAuthId: string;
	title: string;
	content?: string | undefined;
	parents?: string[] | undefined;
	children?: string[] | undefined;
} {
	return {
		userAuthId: dto.userAuthId,
		title: dto.title,
		content: dto.content,
		parents: dto.parents ?? [],
		children: dto.children ?? [],
	};
}

function rowToTask(row: Doc<"tasks">): Task {
	return {
		id: row._id,
		userAuthId: row.userAuthId,
		title: row.title,
		content: row.content ?? undefined,
		status: row.status,
		todaysTask: row.todaysTask ? new Date(row.todaysTask) : undefined,
		parents: row.parents ?? [],
		children: row.children ?? [],
		created: new Date(row._creationTime),
		lastEdit: new Date(row.lastEdit),
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
