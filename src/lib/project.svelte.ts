import { getContext, setContext } from 'svelte';
import type { Project } from './api/types';
import { canWrite } from './format';

const key = Symbol('project');

/** The open project, shared by every page under /projects/[projectId]. */
export class ProjectState {
	project = $state<Project | null>(null);

	/** Uploading, deleting and starting jobs need WRITE or OWNER on an active project. */
	get editable() {
		return (
			!!this.project && this.project.status === 'ACTIVE' && canWrite(this.project.myPermission)
		);
	}
}

export const setProject = (state: ProjectState) => setContext(key, state);
export const useProject = () => getContext<ProjectState>(key);
