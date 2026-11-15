import { getContext, setContext } from 'svelte';
import { api } from '../../lib/api.js';
import { isPackable } from '../../lib/files.js';
import { allows } from '../../lib/format.js';
import { limitsOf } from '../../lib/schema.js';

const key = Symbol('project');

let schemaPromise = null;

export function loadSchema() {
  schemaPromise ??= api.inputSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export function resetSchema() {
  schemaPromise = null;
}

export function createProjectContext(projectId) {
  const ctx = $state({
    id: projectId,
    project: null,
    missing: false,
    error: '',
    counts: { files: null, packable: null, jobs: null, members: null, owners: null },
    creator: null,
    acceptedFormats: ['OBJ'],
    get active() {
      return this.project?.status === 'ACTIVE';
    },
    get canWrite() {
      return this.active && allows(this.project?.myPermission, 'WRITE');
    },
    get isOwner() {
      return this.project?.myPermission === 'OWNER';
    },
    get soleOwner() {
      return this.isOwner && this.counts.owners === 1;
    }
  });

  async function load() {
    try {
      ctx.project = await api.project(projectId);
      ctx.error = '';
      refreshCounts();
    } catch (error) {
      if (error.status === 404 || error.status === 400) ctx.missing = true;
      else ctx.error = error.message;
    }
  }

  async function refreshCounts() {
    const packableCount = loadSchema()
      .then((schema) => limitsOf(schema).acceptedFormats)
      .catch(() => ctx.acceptedFormats)
      .then((formats) => {
        ctx.acceptedFormats = formats;
        return countPackable(formats);
      });
    const roster = api.members(projectId, { size: 100 });
    const ownerCount = roster.then((page) =>
      page.totalElements <= page.content.length
        ? page.content.filter((member) => member.permission === 'OWNER').length
        : api.members(projectId, { size: 1, permission: ['OWNER'] }).then((owners) => owners.totalElements)
    );
    const [files, packable, jobs, members, owners] = await Promise.allSettled([
      api.files(projectId, { size: 1 }),
      packableCount,
      api.jobs(projectId, { size: 1 }),
      roster,
      ownerCount
    ]);
    const total = (entry) => (entry.status === 'fulfilled' ? entry.value.totalElements : null);
    ctx.counts = {
      files: total(files),
      packable: packable.status === 'fulfilled' ? packable.value : null,
      jobs: total(jobs),
      members: total(members),
      owners: owners.status === 'fulfilled' ? owners.value : null
    };
    if (members.status === 'fulfilled' && ctx.project) {
      ctx.creator = members.value.content.find((member) => member.userId === ctx.project.createdBy) ?? null;
    }
  }

  async function countPackable(formats) {
    let count = 0;
    for (let page = 0; page < 20; page++) {
      const result = await api.files(projectId, { page, size: 100 });
      count += result.content.filter((file) => isPackable(file, formats)).length;
      if (page >= result.totalPages - 1) return count;
    }
    return null;
  }

  async function refresh() {
    try {
      ctx.project = await api.project(projectId);
    } catch (error) {
      if (error.status === 404) ctx.missing = true;
    }
    await refreshCounts();
  }

  const value = { ctx, load, refresh, refreshCounts };
  setContext(key, value);
  return value;
}

export const useProject = () => getContext(key);
