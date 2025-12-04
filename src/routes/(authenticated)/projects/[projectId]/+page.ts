import tasksAPI from '$lib/API/Tasks';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const projectStore = tasksAPI.getProjectSubtree(params.projectId);
	return {
		projectStore
	};
};