import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { UsersFavorite } from './usersFavorite';

enum typeNode {
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
        public readonly nodeType: typeNode,
        extensionPath: string,
        public readonly command?: vscode.Command) {
        super(label, collapsibleState);
        this.label = `${this.label}`;
        this.tooltip = `${this.label}`;
        this.id = id;
        this.contextValue = contextValue;
        this.nodeType = nodeType;
        this.command = command; // Устанавливаем команду клика
        this.iconPath = {
            light: vscode.Uri.file(path.join(extensionPath, 'images', 'light', icon)),
            dark: vscode.Uri.file(path.join(extensionPath, 'images', 'dark', icon))
        };
    }
}
export class GitlabUsersProvider implements vscode.TreeDataProvider<GitlabUser> {
    private readonly GITLAB_TOKEN_KEY = 'gitlab.token';
    private panelIssue: vscode.WebviewPanel | undefined;
    private userFavorites: UsersFavorite;
    private _sessionToken: string | undefined;
    private _sessionGitlabUrl: string | undefined;
    private _webviewMessageDisposable: vscode.Disposable | undefined;
    private _onDidChangeTreeData: vscode.EventEmitter<GitlabUser | undefined | void> = new vscode.EventEmitter<GitlabUser | undefined | void>()
    readonly onDidChangeTreeData: vscode.Event<GitlabUser | undefined | void> = this._onDidChangeTreeData.event;
    
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly extensionPath: string
    ) {
		this.userFavorites = new UsersFavorite();
	}

    /**
     * @brief Получить URL GitLab сервера из конфигурации расширения
     * @details Читает значение gitlabIssues.gitlabUrl из настроек VS Code
     * @return {string} URL GitLab сервера
     */
    private getGitlabUrl(): string {
        const config = vscode.workspace.getConfiguration('gitlabIssues');
        return config.get<string>('gitlabUrl', '');
    }

    /**
     * @brief Получить токен доступа GitLab из secret storage
     * @details Прочитает сохраённый токен из secure хранилища расширения
     * @return {Promise<string | undefined>} Токен или undefined, если токен не сохранён
     */
    private async getGitlabToken(): Promise<string | undefined> {
        return await this.context.secrets.get(this.GITLAB_TOKEN_KEY);
    }

    /**
     * @brief Сохранить токен доступа в secret storage
     * @details Сохраняет токен в secure хранилище расширения VS Code
     * @param {string} token GitLab токен
     * @return {Promise<void>}
     */
    private async saveGitlabToken(token: string): Promise<void> {
        await this.context.secrets.store(this.GITLAB_TOKEN_KEY, token);
    }

    /**
     * @brief Запросить URL GitLab у пользователя
     */
    private async promptForGitlabUrl(): Promise<string | undefined> {
        const currentUrl = this.getGitlabUrl();
        const url = await vscode.window.showInputBox({
            prompt: 'Введите URL GitLab (например, https://gitlab.com/)',
            value: currentUrl || undefined,
            placeHolder: 'https://gitlab.com/',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value.trim()) return 'Укажите URL';
                try {
                    new URL(value.trim().endsWith('/') ? value.trim() : value.trim() + '/');
                    return null;
                } catch {
                    return 'Некорректный URL';
                }
            }
        });
        if (url) {
            const normalized = url.trim().endsWith('/') ? url.trim() : url.trim() + '/';
            await vscode.workspace.getConfiguration('gitlabIssues').update('gitlabUrl', normalized, vscode.ConfigurationTarget.Global);
            return normalized;
        }
        return undefined;
    }

    /**
     * @brief Запросить токен доступа у пользователя
     */
    private async promptForToken(): Promise<string | undefined> {
        const token = await vscode.window.showInputBox({
            prompt: 'Введите GitLab токен доступа',
            password: true,
            ignoreFocusOut: true,
            placeHolder: ''
        });
        return token;
    }

    /**
     * @brief Запросить учётные данные при неудачной авторизации или их отсутствии
     * @return {Promise<{token: string, url: string} | undefined>} Токен и URL или undefined при отмене
     */
    private async promptForCredentialsOnAuthFailure(): Promise<{ token: string; url: string } | undefined> {
        const choice = await vscode.window.showErrorMessage(
            'Не удалось авторизоваться. Укажите URL GitLab и токен.',
            'Настроить',
            'Отмена'
        );
        if (choice !== 'Настроить') return undefined;

        let url = await this.promptForGitlabUrl();
        if (!url) return undefined;

        let token = await this.promptForToken();
        if (!token) return undefined;

        await this.saveGitlabToken(token);
        return { token, url };
    }

    /**
     * @brief Проверить валидность токена
     * @details Попытается выполнить простой запрос к API с данным токеном
     * @param {string} token GitLab токен
     * @param {string} url URL GitLab сервера
     * @return {Promise<boolean>} true если токен валидный, false иначе
     */
    private async isTokenValid(token: string, url: string): Promise<boolean> {
        try {
            await axios.get(url + '/api/v4/user', {
                headers: {
                    'PRIVATE-TOKEN': token
                },
                timeout: 5000
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitlabUser): vscode.TreeItem {
        return element;
    }
    getChildren(element?: GitlabUser): Thenable<GitlabUser[]> {
        if (element === undefined) {
            return Promise.resolve(this.getGroups());
        }
        else if (element.nodeType === typeNode.Group) {
            return Promise.resolve(this.getGroups(element.id));
        }
        return Promise.resolve([]);
    }
    private async getGroups(parent_id?: string): Promise<GitlabUser[]> {
        let result: GitlabUser[] = [];
        let token = await this.getGitlabToken();
        let gitlabUrl = this.getGitlabUrl();

        // Запрашивать URL и токен только при отсутствии или при неудачной авторизации
        while (true) {
            if (!gitlabUrl || !token) {
                const creds = await this.promptForCredentialsOnAuthFailure();
                if (!creds) return [];
                token = creds.token;
                gitlabUrl = creds.url;
            }

            const isValid = await this.isTokenValid(token, gitlabUrl);
            if (isValid) break;

            const creds = await this.promptForCredentialsOnAuthFailure();
            if (!creds) return [];
            token = creds.token;
            gitlabUrl = creds.url;
        }

        const response = await this.GetGroupsFromGitlab(token, gitlabUrl);
        for (const group of response) {
            if (parent_id) {
                if (parent_id == group.parent_id) {
                    result.push(new GitlabUser(
                        group.full_name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        group.id.toString(),
                        'PeopleGroup.png',
                        'group',
                        typeNode.Group,
                        this.extensionPath
                    ));
                }
            }
            else {
                if (group.parent_id === null) {
                    result.push(new GitlabUser(
                        group.full_name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        group.id.toString(),
                        'PeopleGroup.png',
                        'group',
                        typeNode.Group,
                        this.extensionPath
                    ));
                }
            }
        }
        if (parent_id) {
            const responseUsers = await this.GetUsersFromGitlab(token, gitlabUrl, parent_id.toString());
            for (const user of responseUsers) {
                const clickCommand: vscode.Command = {
                    command: 'UsersGitlab.viewIssues',
                    title: 'Показать задачи пользователя',
                    arguments: [`${user.id}`, user.username] // Передаем ID элемента и ID группы
                };
                result.push(new GitlabUser(
                    user.name,
                    vscode.TreeItemCollapsibleState.None,
                    `user_${parent_id}_${user.id}`,
                    'UserOutlined.png',
                    'user',
                    typeNode.User,
                    this.extensionPath,
                    clickCommand
                ));
            }
        }
        return result;
    }
    private async GetGroupsFromGitlab(GITLAB_TOKEN: string, GITLAB_URL: string) {
        return await axios.get(GITLAB_URL + '/api/v4/groups', {
            headers: {
                'PRIVATE-TOKEN': GITLAB_TOKEN
            }
        }).then(response => {
            return response.data;
        }).catch(error => {
            console.error('Error fetching project:', error);
        });
    }
    private async GetUsersFromGitlab(GITLAB_TOKEN: string, GITLAB_URL: string, group_id: string) {
        return await axios.get(GITLAB_URL + `/api/v4/groups/${group_id}/members`, {
            headers: {
                'PRIVATE-TOKEN': GITLAB_TOKEN
            }
        }).then(response => {
            return response.data;
        }).catch(error => {
            console.error('Error fetching users:', error);
        });
    }

    private async GetIssueNotes(token: string, gitlabUrl: string, projectId: string, issueIid: string) {
        try {
            const response = await axios.get(
                `${gitlabUrl}api/v4/projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes?per_page=100`,
                {
                    headers: { 'PRIVATE-TOKEN': token },
                    timeout: 10000
                }
            );
            return (response.data || []).filter((n: { system?: boolean }) => !n.system);
        } catch (error) {
            console.error('Error fetching issue notes:', error);
            return [];
        }
    }
    async addToFavorites(node: GitlabUser): Promise<void> {
		if (node.nodeType === typeNode.User && node.command?.arguments) {            
			this.userFavorites.addToFavorites(node.command?.arguments[0], node.label);
		}
	}
    public async viewIssues(userId: string, userName: string) {
        let token = await this.getGitlabToken();
        let gitlabUrl = this.getGitlabUrl();

        while (!token || !gitlabUrl) {
            const creds = await this.promptForCredentialsOnAuthFailure();
            if (!creds) return;
            token = creds.token;
            gitlabUrl = creds.url;
        }

        if (!(await this.isTokenValid(token, gitlabUrl))) {
            const creds = await this.promptForCredentialsOnAuthFailure();
            if (!creds) return;
            token = creds.token;
            gitlabUrl = creds.url;
            if (!(await this.isTokenValid(token, gitlabUrl))) return;
        }

        if (this.panelIssue === undefined) {
            this.panelIssue = vscode.window.createWebviewPanel(
                'Issues',
                `Задачи пользователя`,
                vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            this.panelIssue.onDidDispose(() => {
                this._webviewMessageDisposable?.dispose();
                this._webviewMessageDisposable = undefined;
                this._sessionToken = undefined;
                this._sessionGitlabUrl = undefined;
                this.panelIssue = undefined;
            });
        }
        if (!this.panelIssue?.active) {
            this.panelIssue.reveal();
            this.panelIssue.title = `Задачи пользователя`;
        }
        const issues = await axios.get(gitlabUrl + `api/v4/issues?assignee_id=${userId}&scope=all&state=opened&per_page=50`, {
            headers: { 'PRIVATE-TOKEN': token }
        }).then(response => response.data).catch(error => {
            console.error('Error fetching issues:', error);
            return [];
        });

        this._sessionToken = token;
        this._sessionGitlabUrl = gitlabUrl;

        this.panelIssue.webview.options = { enableScripts: true };
        this._webviewMessageDisposable?.dispose();
        this._webviewMessageDisposable = this.panelIssue.webview.onDidReceiveMessage(async (msg: { command: string; projectId?: string; issueIid?: string; url?: string }) => {
            if (msg.command === 'getComments' && msg.projectId && msg.issueIid && this._sessionToken && this._sessionGitlabUrl) {
                const comments = await this.GetIssueNotes(this._sessionToken, this._sessionGitlabUrl, msg.projectId, msg.issueIid);
                this.panelIssue?.webview.postMessage({ command: 'comments', projectId: msg.projectId, issueIid: msg.issueIid, comments });
            } else if (msg.command === 'openExternal' && msg.url) {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
        });

        const templatePath = path.join(this.extensionPath, 'media', 'issuesView.html');
        let html = fs.readFileSync(templatePath, 'utf-8');
        const issuesJson = JSON.stringify(issues).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        html = html
            .replace(/\{\{userName\}\}/g, escapeHtml(userName))
            .replace(/\{\{issuesJson\}\}/g, issuesJson)
            .replace(/\{\{issuesCount\}\}/g, String(issues.length))
            .replace(/\{\{updatedAt\}\}/g, new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }));

        this.panelIssue.webview.html = html;
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