import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { UsersFavorite } from './usersFavorite';
import { AuthService } from './authService';
import { GitLabApi, type GitlabIssue } from './gitlabApi';

const CONFIG_SECTION = 'gitlabIssues';

/** Встроенный шаблон; свой — через dailyTemplatePath, плейсхолдеры: {{date}}, {{dateLong}}, {{dateHuman}}, {{gitlabIssuesByUser}} */
export const DEFAULT_DAILY_TEMPLATE = `## Стендап — {{dateLong}}

### 🎯 Общая информация
- **Дата:** {{dateHuman}}
- **Время стендапа:** 

#### 📝 Новые задачи
- [ ] 

#### 📋 Общие блокеры и риски
- [ ] 

#### 🔄 Action items для меня
- [ ] 


### 🗣️ Стендап (GitLab — до 50 открытых задач на человека)

{{gitlabIssuesByUser}}

---
_Сгенерировано расширением GitLab Issues._
`;

function formatDateParts(d: Date): { iso: string; longRu: string; shortHuman: string } {
    const iso = d.toISOString().slice(0, 10);
    const longRu = d.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const shortHuman = d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    return { iso, longRu, shortHuman };
}

function sanitizeIssueTitle(title: string): string {
    return title.replace(/\s+/g, ' ').trim().replace(/\]/g, '\\]');
}

function buildIssuesMarkdown(issues: GitlabIssue[]): string {
    if (issues.length === 0) {
        return '- _Нет открытых задач_';
    }
    return issues
        .map((issue) => {
            const t = sanitizeIssueTitle(issue.title);
            const link = issue.web_url ? `[${t}](${issue.web_url})` : t;
            const ref = issue.references?.full ? ` — \`${issue.references.full}\`` : '';
            return `- ${link}${ref}`;
        })
        .join('\n');
}

function buildGitlabIssuesByUserSection(entries: { name: string; issues: GitlabIssue[] }[]): string {
    const parts: string[] = [];
    for (const { name, issues } of entries) {
        parts.push(`#### ${name}\n`);
        parts.push(buildIssuesMarkdown(issues));
        if (issues.length >= 50) {
            parts.push('\n\n_Показано не более 50 открытых задач (лимит API)._');
        }
        parts.push('\n\n');
    }
    return parts.join('').trimEnd();
}

/** Относительные пути требуют открытого workspace. */
function resolvePath(raw: string): string {
    const trimmed = raw.trim();
    if (path.isAbsolute(trimmed)) {
        return trimmed;
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        throw new Error('WORKSPACE_REQUIRED');
    }
    return path.join(root, trimmed);
}

export async function exportDailyStandup(auth: AuthService): Promise<void> {
    const creds = await auth.ensureValidCredentials();
    if (!creds) {
        return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const folderRaw = config.get<string>('dailyExportFolder', '')?.trim() ?? '';
    const templatePathRaw = config.get<string>('dailyTemplatePath', '')?.trim() ?? '';

    if (!folderRaw) {
        void vscode.window.showErrorMessage(
            'Укажите папку экспорта: Settings → GitLab Issues → Daily export folder (gitlabIssues.dailyExportFolder)'
        );
        return;
    }

    const favorites = new UsersFavorite().getFavorites();
    if (favorites.length === 0) {
        void vscode.window.showWarningMessage(
            'В избранном нет пользователей. Добавьте людей: Favorites Gitlab → Add to Favorites.'
        );
        return;
    }

    let folderResolved: string;
    try {
        folderResolved = resolvePath(folderRaw);
    } catch {
        void vscode.window.showErrorMessage(
            'Для относительного пути экспорта откройте папку в VS Code или укажите абсолютный путь (gitlabIssues.dailyExportFolder).'
        );
        return;
    }

    try {
        if (!fs.existsSync(folderResolved)) {
            fs.mkdirSync(folderResolved, { recursive: true });
        }
    } catch {
        void vscode.window.showErrorMessage(`Не удалось создать папку: ${folderResolved}`);
        return;
    }

    const api = new GitLabApi(creds.url, creds.token);
    const entries: { name: string; issues: GitlabIssue[] }[] = [];

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Экспорт дэйлика из GitLab…',
            cancellable: false
        },
        async () => {
            for (const fav of favorites) {
                const issues = await api.getIssues(fav.id);
                entries.push({ name: fav.label, issues });
            }
        }
    );

    const date = new Date();
    const { iso, longRu, shortHuman } = formatDateParts(date);

    let templateContent = DEFAULT_DAILY_TEMPLATE;
    if (templatePathRaw) {
        let tp: string;
        try {
            tp = resolvePath(templatePathRaw);
        } catch {
            void vscode.window.showErrorMessage(
                'Для относительного пути шаблона откройте папку в VS Code или укажите абсолютный путь (gitlabIssues.dailyTemplatePath).'
            );
            return;
        }
        try {
            if (fs.existsSync(tp)) {
                templateContent = fs.readFileSync(tp, 'utf-8');
            } else {
                void vscode.window.showWarningMessage(
                    `Шаблон не найден (${tp}), используется встроенный.`
                );
            }
        } catch {
            void vscode.window.showErrorMessage(`Не удалось прочитать шаблон: ${tp}`);
            return;
        }
    }

    const gitlabBlock = buildGitlabIssuesByUserSection(entries);

    const output = templateContent
        .replace(/\{\{date\}\}/g, iso)
        .replace(/\{\{dateLong\}\}/g, longRu)
        .replace(/\{\{dateHuman\}\}/g, shortHuman)
        .replace(/\{\{gitlabIssuesByUser\}\}/g, gitlabBlock);

    const fileName = `${iso}.md`;
    const outPath = path.join(folderResolved, fileName);

    if (fs.existsSync(outPath)) {
        const choice = await vscode.window.showWarningMessage(
            `Файл уже существует: ${fileName}`,
            'Перезаписать',
            'Отмена'
        );
        if (choice !== 'Перезаписать') {
            return;
        }
    }

    try {
        fs.writeFileSync(outPath, output, 'utf-8');
    } catch {
        void vscode.window.showErrorMessage(`Не удалось записать файл: ${outPath}`);
        return;
    }

    void vscode.window.showInformationMessage(`Дэйлик сохранён: ${outPath}`);

    try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(outPath));
        await vscode.window.showTextDocument(doc);
    } catch {
        // ignore open failure
    }
}
