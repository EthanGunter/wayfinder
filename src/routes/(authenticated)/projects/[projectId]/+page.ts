import type { IAppNode } from '$domain/models/node';
import type { ProjectData } from '$domain/models/project';
import type { QueryableStore } from '$lib/API/fetchableStore';
import tasksAPI from '$lib/API/Tasks';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const projectStore = tasksAPI.getProjectSubtree(params.projectId);
	const projectNodeStore: QueryableStore<{ id: string }, IAppNode<ProjectData>> = tasksAPI.getTask(params.projectId) as any;
	return {
		projectStore,
		projectNodeStore
	};
};