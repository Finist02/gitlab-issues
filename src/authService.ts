import * as vscode from 'vscode';
import { GitLabApi } from './gitlabApi';

const CONFIG_SECTION = 'gitlabIssues';
const CONFIG_URL_KEY = 'gitlabUrl';
const TOKEN_SECRET_KEY = 'gitlab.token';

export interface Credentials {
    token: string;
    url: string;
}

export class AuthService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    getGitlabUrl(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_URL_KEY, '') ?? '';
    }

    async getToken(): Promise<string | undefined> {
        return this.context.secrets.get(TOKEN_SECRET_KEY);
    }

    private async saveToken(token: string): Promise<void> {
        await this.context.secrets.store(TOKEN_SECRET_KEY, token);
    }

    private static normalizeUrl(url: string): string {
        const trimmed = url.trim();
        return trimmed.endsWith('/') ? trimmed : trimmed + '/';
    }

    async promptForUrl(): Promise<string | undefined> {
        const current = this.getGitlabUrl();
        const input = await vscode.window.showInputBox({
            prompt: 'Введите URL GitLab (например, https://gitlab.com/)',
            value: current || undefined,
            placeHolder: 'https://gitlab.com/',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value.trim()) return 'Укажите URL';
                try {
                    new URL(AuthService.normalizeUrl(value));
                    return null;
                } catch {
                    return 'Некорректный URL';
                }
            }
        });
        if (!input) return undefined;

        const normalized = AuthService.normalizeUrl(input);
        await vscode.workspace.getConfiguration(CONFIG_SECTION).update(
            CONFIG_URL_KEY,
            normalized,
            vscode.ConfigurationTarget.Global
        );
        return normalized;
    }

    private async promptForToken(): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt: 'Введите GitLab токен доступа',
            password: true,
            ignoreFocusOut: true,
            placeHolder: ''
        });
    }

    async promptForCredentials(): Promise<Credentials | undefined> {
        const choice = await vscode.window.showErrorMessage(
            'Не удалось авторизоваться. Укажите URL GitLab и токен.',
            'Настроить',
            'Отмена'
        );
        if (choice !== 'Настроить') return undefined;

        const url = await this.promptForUrl();
        if (!url) return undefined;

        const token = await this.promptForToken();
        if (!token) return undefined;

        await this.saveToken(token);
        return { token, url };
    }

    async ensureValidCredentials(): Promise<Credentials | undefined> {
        let token = await this.getToken();
        let url = this.getGitlabUrl();

        while (true) {
            if (!url || !token) {
                const creds = await this.promptForCredentials();
                if (!creds) return undefined;
                token = creds.token;
                url = creds.url;
            }

            const api = new GitLabApi(url, token);
            if (await api.validateToken()) {
                return { token, url };
            }

            const creds = await this.promptForCredentials();
            if (!creds) return undefined;
            token = creds.token;
            url = creds.url;
        }
    }
}
