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
    labels?: string[];
    created_at: string;
    updated_at: string;
}

export interface GitlabNote {
    id: number;
    body: string;
    author?: { name?: string };
    created_at: string;
    system?: boolean;
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
