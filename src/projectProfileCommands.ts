import * as vscode from 'vscode';
import {
    getProjectProfiles,
    getActiveProjectProfileId,
    setActiveProjectProfileId,
    type ProjectProfile
} from './projectProfileService';

interface ProfilePick extends vscode.QuickPickItem {
    action: 'pick' | 'clear';
    profileId?: string;
}

export async function selectProjectProfile(): Promise<void> {
    const profiles = getProjectProfiles();
    if (profiles.length === 0) {
        void vscode.window.showWarningMessage(
            'Задайте массив gitlabIssues.projectProfiles в настройках (id, label, gitlabProjectRefs).'
        );
        return;
    }

    const activeId = getActiveProjectProfileId();
    const items: ProfilePick[] = profiles.map((p: ProjectProfile) => ({
        label: p.label,
        description: p.id === activeId ? '$(check) текущий' : p.id,
        detail: p.gitlabProjectRefs.join(', '),
        action: 'pick' as const,
        profileId: p.id
    }));

    items.push({
        label: '— Сбросить активный профиль —',
        description: '',
        action: 'clear'
    });

    const picked = await vscode.window.showQuickPick<ProfilePick>(items, {
        title: 'Активный профиль проекта (GitLab)',
        placeHolder: 'Несколько репозиториев задаются в gitlabProjectRefs'
    });

    if (!picked) {
        return;
    }

    if (picked.action === 'clear') {
        await setActiveProjectProfileId(undefined);
        void vscode.window.showInformationMessage('Активный профиль сброшен');
        return;
    }

    if (picked.profileId) {
        await setActiveProjectProfileId(picked.profileId);
        void vscode.window.showInformationMessage(`Профиль: ${picked.label}`);
    }
}
