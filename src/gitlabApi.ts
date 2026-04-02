import axios, { AxiosInstance } from 'axios';

const API_TIMEOUT = 10000;

export interface GitlabGroup {
    id: number;
    full_name: string;
    parent_id: number | null;
}

export interface GitlabMember {
    id: number;
    username: string;
    name: string;
}

export interface GitlabIssue {
    id: number;
    iid: number;
    project_id: number;
    title: string;
    description?: string;
    web_url?: string;
    references?: { full?: string };
    /** Строки или объекты `{ name }` в зависимости от ответа API */
    labels?: Array<string | { name?: string }>;
    created_at: string;
    updated_at: string;
    /** ISO date `YYYY-MM-DD` или `null` */
    due_date?: string | null;
    /** Если GitLab отдаёт (зависит от версии/лицензии) */
    start_date?: string | null;
}

export interface GitlabNote {
    id: number;
    body: string;
    author?: { name?: string };
    created_at: string;
    system?: boolean;
}

/**
 * Путь проекта для `GET /projects/:id/issues`.
 * Важно: ведущий `/` даёт при `encodeURIComponent` неверный id (`%2Fgroup%2F...` вместо `group%2F...`) → 404.
 * Подходит `namespace/project` или числовой id проекта.
 */
export function normalizeGitlabProjectRef(ref: string): string {
    let s = ref.trim();
    if (s.toLowerCase().endsWith('.git')) {
        s = s.slice(0, -4).trim();
    }
    s = s.replace(/^\/+/, '').replace(/\/+$/, '');
    s = s.replace(/\/{2,}/g, '/');
    return s;
}

export class GitLabApi {
    constructor(
        private readonly baseUrl: string,
        private readonly token: string
    ) {}

    private apiPath(path: string): string {
        const base = this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/';
        return `${base}api/v4/${path}`;
    }

    private client(): AxiosInstance {
        return axios.create({
            timeout: API_TIMEOUT,
            headers: { 'PRIVATE-TOKEN': this.token }
        });
    }

    async validateToken(): Promise<boolean> {
        try {
            await this.client().get(this.apiPath('user'));
            return true;
        } catch {
            return false;
        }
    }

    async getGroups(): Promise<GitlabGroup[]> {
        try {
            const { data } = await this.client().get<GitlabGroup[]>(this.apiPath('groups'));
            return data ?? [];
        } catch (error) {
            console.error('Error fetching groups:', error);
            return [];
        }
    }

    async getGroupMembers(groupId: string): Promise<GitlabMember[]> {
        try {
            const { data } = await this.client().get<GitlabMember[]>(
                this.apiPath(`groups/${groupId}/members`)
            );
            return data ?? [];
        } catch (error) {
            console.error('Error fetching group members:', error);
            return [];
        }
    }

    async getIssues(assigneeId: string): Promise<GitlabIssue[]> {
        try {
            const { data } = await this.client().get<GitlabIssue[]>(
                this.apiPath(`issues?assignee_id=${assigneeId}&scope=all&state=opened&per_page=50`)
            );
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('Error fetching issues:', error);
            return [];
        }
    }

    /**
     * Открытые issues одного проекта (path `group/repo` или id). Пагинация, лимит на проект.
     */
    async getProjectIssuesOpened(projectRef: string, maxTotal = 500): Promise<GitlabIssue[]> {
        const normalized = normalizeGitlabProjectRef(projectRef);
        if (!normalized) {
            console.error('Empty GitLab project ref after normalize:', projectRef);
            return [];
        }
        const encoded = encodeURIComponent(normalized);
        const all: GitlabIssue[] = [];
        let page = 1;
        try {
            while (all.length < maxTotal) {
                const perPage = Math.min(100, maxTotal - all.length);
                const { data } = await this.client().get<GitlabIssue[]>(
                    this.apiPath(`projects/${encoded}/issues`),
                    {
                        params: {
                            state: 'opened',
                            per_page: perPage,
                            page,
                            order_by: 'updated_at',
                            sort: 'desc'
                        }
                    }
                );
                const batch = Array.isArray(data) ? data : [];
                if (batch.length === 0) {
                    break;
                }
                all.push(...batch);
                if (batch.length < perPage) {
                    break;
                }
                page += 1;
            }
        } catch (error) {
            console.error(
                'Error fetching project issues:',
                normalized,
                '(raw:',
                projectRef,
                ')',
                error
            );
            return [];
        }
        return all;
    }

    async getIssueNotes(projectId: string, issueIid: string): Promise<GitlabNote[]> {
        try {
            const path = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes?per_page=100&sort=asc`;
            const { data } = await this.client().get<GitlabNote[]>(this.apiPath(path));
            return (data ?? []).filter((n) => !n.system);
        } catch (error) {
            console.error('Error fetching issue notes:', error);
            return [];
        }
    }

    async updateIssue(
        projectId: string,
        issueIid: string,
        params: { state_event?: 'close' | 'reopen'; assignee_ids?: number[] }
    ): Promise<boolean> {
        try {
            const path = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
            await this.client().put(this.apiPath(path), params);
            return true;
        } catch (error) {
            console.error('Error updating issue:', error);
            return false;
        }
    }

    async getProjectMembersAll(projectId: string): Promise<GitlabMember[]> {
        try {
            const { data } = await this.client().get<GitlabMember[]>(
                this.apiPath(`projects/${encodeURIComponent(projectId)}/members/all?per_page=100`)
            );
            const members = data ?? [];
            const byId = new Map<number, GitlabMember>();
            for (const m of members) {
                const uid = m.id;
                if (uid != null && !byId.has(uid)) byId.set(uid, m);
            }
            return Array.from(byId.values());
        } catch (error) {
            console.error('Error fetching project members (all):', error);
            return [];
        }
    }
}
