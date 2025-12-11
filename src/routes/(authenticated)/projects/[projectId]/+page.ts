import tasksAPI from '$lib/API/Tasks';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const projectStore = tasksAPI.getProjectSubtree(params.projectId);
	const projectNodeStore = tasksAPI.getTask(params.projectId);
	return {
		projectStore,
		projectNodeStore
	};
};