import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AuthService } from './authService';
import { GitLabApi, type GitlabIssue } from './gitlabApi';
import { getActiveProjectProfile } from './projectProfileService';
import {
    classifyIssueGanttStatus,
    getGanttLabelRules,
    normalizeIssueLabels
} from './ganttLabelRules';

const CONFIG_SECTION = 'gitlabIssues';

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

function escapeMermaidTaskTitle(title: string, issueId: number): string {
    const t = title.replace(/[\n\r]+/g, ' ').replace(/[:,]/g, ' ').trim().slice(0, 72);
    return t || `Issue ${issueId}`;
}

/** Календарные дни между двумя UTC-датами (включительно), минимум 1 */
function calendarDaysInclusive(start: Date, end: Date): number {
    const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const diff = Math.round((e - s) / 86400000) + 1;
    return Math.max(1, diff);
}

function parseYmdToUtcDate(ymd: string): Date {
    const t = ymd.trim().split('-').map(Number);
    return new Date(Date.UTC(t[0], t[1] - 1, t[2]));
}

function formatYmdUtc(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Полоса Gantt: от start_date (если есть) или от даты создания до due_date.
 * Раньше было фиксировано 1d — теперь длина отражает интервал (макс. 365 дней).
 */
function ganttStartAndDuration(issue: GitlabIssue, dueYmd: string): { startYmd: string; days: number } {
    const due = parseYmdToUtcDate(dueYmd);
    const startRaw = issue.start_date?.trim();
    let start: Date;
    if (startRaw) {
        start = parseYmdToUtcDate(startRaw);
    } else {
        start = new Date(issue.created_at);
    }
    let days = calendarDaysInclusive(start, due);
    if (days > 365) {
        days = 365;
    }
    return { startYmd: formatYmdUtc(start), days };
}

function slugFile(s: string): string {
    return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

function buildMermaidGantt(issues: GitlabIssue[]): string {
    if (issues.length === 0) {
        return '_Нет задач с due date._';
    }
    const { done: donePatterns, active: activePatterns } = getGanttLabelRules();

    const lines: string[] = [
        '```mermaid',
        'gantt',
        '    title Открытые задачи со сроком',
        '    dateFormat YYYY-MM-DD',
        '    axisFormat %d %b',
        '    section Сроки'
    ];
    for (const issue of issues) {
        const due = issue.due_date?.trim();
        if (!due) {
            continue;
        }
        const labelStrs = normalizeIssueLabels(issue);
        const ganttStatus = classifyIssueGanttStatus(labelStrs, donePatterns, activePatterns);

        const label = escapeMermaidTaskTitle(issue.title, issue.id);
        const taskId = `i${issue.id}`;
        const { startYmd, days } = ganttStartAndDuration(issue, due);
        if (ganttStatus) {
            lines.push(`    ${label} :${ganttStatus}, ${taskId}, ${startYmd}, ${days}d`);
        } else {
            lines.push(`    ${label} :${taskId}, ${startYmd}, ${days}d`);
        }
    }
    lines.push('```');
    return lines.join('\n');
}

function buildBacklogList(issues: GitlabIssue[]): string {
    if (issues.length === 0) {
        return '_Нет открытых задач без срока._';
    }
    return issues
        .map((issue) => {
            const ref = issue.references?.full ? ` — \`${issue.references.full}\`` : '';
            const link = issue.web_url ? `[${issue.title.replace(/\]/g, '\\]')}](${issue.web_url})` : issue.title;
            return `- ${link}${ref}`;
        })
        .join('\n');
}

export async function exportProjectOverview(auth: AuthService): Promise<void> {
    const profile = getActiveProjectProfile();
    if (!profile) {
        void vscode.window.showErrorMessage(
            'Выберите профиль проекта: команда «GitLab Issues: Select project profile» или настройка gitlabIssues.activeProjectProfileId. Задайте gitlabIssues.projectProfiles.'
        );
        return;
    }

    const creds = await auth.ensureValidCredentials();
    if (!creds) {
        return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const projectFolderRaw = config.get<string>('projectExportFolder', '')?.trim() ?? '';
    const dailyFolderRaw = config.get<string>('dailyExportFolder', '')?.trim() ?? '';
    const folderRaw = projectFolderRaw || dailyFolderRaw;
    if (!folderRaw) {
        void vscode.window.showErrorMessage(
            'Укажите папку: gitlabIssues.projectExportFolder или gitlabIssues.dailyExportFolder'
        );
        return;
    }

    let folderResolved: string;
    try {
        folderResolved = resolvePath(folderRaw);
    } catch {
        void vscode.window.showErrorMessage(
            'Для относительного пути откройте папку в VS Code или укажите абсолютный путь к папке экспорта.'
        );
        return;
    }

    const profileDirName = slugFile(profile.id);
    const targetDir = path.join(folderResolved, profileDirName);

    try {
        if (!fs.existsSync(folderResolved)) {
            fs.mkdirSync(folderResolved, { recursive: true });
        }
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
    } catch {
        void vscode.window.showErrorMessage(`Не удалось создать папку: ${targetDir}`);
        return;
    }

    const api = new GitLabApi(creds.url, creds.token);

    const merged = new Map<number, GitlabIssue>();
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Загрузка issues: ${profile.label}…`,
            cancellable: false
        },
        async () => {
            for (const projectRef of profile.gitlabProjectRefs) {
                const list = await api.getProjectIssuesOpened(projectRef);
                for (const issue of list) {
                    merged.set(issue.id, issue);
                }
            }
        }
    );

    const all = Array.from(merged.values());

    const hasDueDate = (i: GitlabIssue): boolean => {
        const d = i.due_date;
        if (d === undefined || d === null) {
            return false;
        }
        return String(d).trim() !== '';
    };

    const withDue = all
        .filter((i) => hasDueDate(i))
        .sort((a, b) => {
            const da = String(a.due_date);
            const db = String(b.due_date);
            if (da !== db) {
                return da.localeCompare(db);
            }
            return a.title.localeCompare(b.title);
        });
    const withoutDue = all
        .filter((i) => !hasDueDate(i))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    const iso = new Date().toISOString().slice(0, 10);
    const longRu = new Date().toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const body = [
        `## Проект: ${profile.label}`,
        '',
        `- **Профиль:** \`${profile.id}\``,
        `- **Репозитории:** ${profile.gitlabProjectRefs.map((r) => `\`${r}\``).join(', ')}`,
        `- **Дата выгрузки:** ${longRu}`,
        `- **Всего открытых задач:** ${all.length} (со сроком: ${withDue.length}, без срока: ${withoutDue.length})`,
        '',
        '### Диаграмма (Mermaid Gantt)',
        '',
        buildMermaidGantt(withDue),
        '',
        '### Без срока',
        '',
        buildBacklogList(withoutDue),
        '',
        '---',
        '_Сгенерировано расширением GitLab Issues._'
    ].join('\n');

    const fileName = `${iso}.md`;
    const outPath = path.join(targetDir, fileName);

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
        fs.writeFileSync(outPath, body, 'utf-8');
    } catch {
        void vscode.window.showErrorMessage(`Не удалось записать: ${outPath}`);
        return;
    }

    void vscode.window.showInformationMessage(`Обзор проекта сохранён: ${outPath}`);
    try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(outPath));
        await vscode.window.showTextDocument(doc);
    } catch {
        // ignore
    }
}
