import * as vscode from 'vscode';
import { getActiveProjectProfile } from './projectProfileService';

export function refreshProjectStatusBar(item: vscode.StatusBarItem): void {
    const p = getActiveProjectProfile();
    if (p) {
        item.text = `$(folder) ${p.label}`;
        const md = new vscode.MarkdownString(
            `**${p.label}** (\`${p.id}\`)\n\n` +
                p.gitlabProjectRefs.map((r) => `- \`${r}\``).join('\n')
        );
        md.isTrusted = true;
        item.tooltip = md;
        item.show();
    } else {
        item.text = '$(folder) Проект GitLab';
        item.tooltip = 'Выбрать активный профиль (несколько репозиториев)';
        item.show();
    }
}
