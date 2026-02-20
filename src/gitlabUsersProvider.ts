import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { UsersFavorite } from './usersFavorite';
import { AuthService } from './authService';
import { GitLabApi } from './gitlabApi';
import type { GitlabGroup } from './gitlabApi';

export enum TreeNodeType {
    Group,
    User
}

export class GitlabUser extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly id: string,
        public readonly icon: string,
        public contextValue: string,
        public readonly nodeType: TreeNodeType,
        extensionPath: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.label = String(this.label);
        this.tooltip = String(this.label);
        this.id = id;
        this.contextValue = contextValue;
        this.nodeType = nodeType;
        this.command = command;
        this.iconPath = {
            light: vscode.Uri.file(path.join(extensionPath, 'images', 'light', icon)),
            dark: vscode.Uri.file(path.join(extensionPath, 'images', 'dark', icon))
        };
    }
}

export class GitlabUsersProvider implements vscode.TreeDataProvider<GitlabUser> {
    private panelIssue: vscode.WebviewPanel | undefined;
    private readonly userFavorites = new UsersFavorite();
    private _sessionApi: GitLabApi | undefined;
    private _webviewMessageDisposable: vscode.Disposable | undefined;

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<GitlabUser | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly extensionPath: string,
        private readonly auth: AuthService
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitlabUser): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GitlabUser): Thenable<GitlabUser[]> {
        if (!element) {
            return Promise.resolve(this.loadGroups());
        }
        if (element.nodeType === TreeNodeType.Group) {
            return Promise.resolve(this.loadGroups(element.id));
        }
        return Promise.resolve([]);
    }

    private async loadGroups(parentId?: string): Promise<GitlabUser[]> {
        const creds = await this.auth.ensureValidCredentials();
        if (!creds) return [];

        const api = new GitLabApi(creds.url, creds.token);
        const groups = await api.getGroups();
        const result: GitlabUser[] = [];

        for (const group of groups) {
            const matchesParent = parentId
                ? String(group.parent_id) === parentId
                : group.parent_id === null;
            if (!matchesParent) continue;

            result.push(new GitlabUser(
                group.full_name,
                vscode.TreeItemCollapsibleState.Collapsed,
                String(group.id),
                'PeopleGroup.png',
                'group',
                TreeNodeType.Group,
                this.extensionPath
            ));
        }

        if (parentId) {
            const members = await api.getGroupMembers(parentId);
            for (const user of members) {
                result.push(new GitlabUser(
                    user.name,
                    vscode.TreeItemCollapsibleState.None,
                    `user_${parentId}_${user.id}`,
                    'UserOutlined.png',
                    'user',
                    TreeNodeType.User,
                    this.extensionPath,
                    {
                        command: 'UsersGitlab.viewIssues',
                        title: 'Показать задачи пользователя',
                        arguments: [String(user.id), user.username]
                    }
                ));
            }
        }

        return result;
    }

    addToFavorites(node: GitlabUser): void {
        if (node.nodeType === TreeNodeType.User && node.command?.arguments?.[0]) {
            this.userFavorites.addToFavorites(node.command.arguments[0], node.label);
        }
    }

    async viewIssues(userId: string, userName: string): Promise<void> {
        const creds = await this.auth.ensureValidCredentials();
        if (!creds) return;

        const api = new GitLabApi(creds.url, creds.token);
        this.ensurePanel();
        if (!this.panelIssue) return;

        const issues = await api.getIssues(userId);
        this._sessionApi = api;

        this.setupWebviewMessageHandler();

        const html = this.buildIssuesHtml(issues, userName);
        this.panelIssue.webview.html = html;
        this.panelIssue.reveal();
        this.panelIssue.title = `Задачи: ${userName}`;
    }

    private ensurePanel(): void {
        if (this.panelIssue) return;

        this.panelIssue = vscode.window.createWebviewPanel(
            'gitlab-issues',
            'Задачи пользователя',
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panelIssue.onDidDispose(() => {
            this._webviewMessageDisposable?.dispose();
            this._webviewMessageDisposable = undefined;
            this._sessionApi = undefined;
            this.panelIssue = undefined;
        });
    }

    private setupWebviewMessageHandler(): void {
        if (!this.panelIssue) return;

        this.panelIssue.webview.options = { enableScripts: true };
        this._webviewMessageDisposable?.dispose();
        this._webviewMessageDisposable = this.panelIssue.webview.onDidReceiveMessage(
            async (msg: { command: string; projectId?: string; issueIid?: string; url?: string }) => {
                if (msg.command === 'getComments' && msg.projectId && msg.issueIid && this._sessionApi) {
                    const comments = await this._sessionApi.getIssueNotes(msg.projectId, msg.issueIid);
                    this.panelIssue?.webview.postMessage({
                        command: 'comments',
                        projectId: msg.projectId,
                        issueIid: msg.issueIid,
                        comments
                    });
                } else if (msg.command === 'openExternal' && msg.url) {
                    vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
            }
        );
    }

    private buildIssuesHtml(issues: unknown[], userName: string): string {
        const templatePath = path.join(this.extensionPath, 'media', 'issuesView.html');
        let html = fs.readFileSync(templatePath, 'utf-8');

        const issuesJson = JSON.stringify(issues)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e');

        return html
            .replace(/\{\{userName\}\}/g, escapeHtml(userName))
            .replace(/\{\{issuesJson\}\}/g, issuesJson)
            .replace(/\{\{issuesCount\}\}/g, String(issues.length))
            .replace(
                /\{\{updatedAt\}\}/g,
                new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
            );
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
