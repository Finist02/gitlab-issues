import * as vscode from 'vscode';

const CONFIG = 'gitlabIssues';

export interface ProjectProfile {
    /** Стабильный ключ (латиница, без пробелов удобно) */
    id: string;
    /** Заголовок в UI */
    label: string;
    /** Пути проектов GitLab: `namespace/repo` или числовой id */
    gitlabProjectRefs: string[];
}

function normalizeProfiles(raw: unknown): ProjectProfile[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: ProjectProfile[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const o = item as Record<string, unknown>;
        const id = String(o.id ?? '').trim();
        const label = String(o.label ?? id).trim();
        const refsRaw = o.gitlabProjectRefs;
        const gitlabProjectRefs = Array.isArray(refsRaw)
            ? refsRaw.map((r) => String(r).trim()).filter(Boolean)
            : [];
        if (id && gitlabProjectRefs.length > 0) {
            out.push({ id, label: label || id, gitlabProjectRefs });
        }
    }
    return out;
}

export function getProjectProfiles(): ProjectProfile[] {
    const conf = vscode.workspace.getConfiguration(CONFIG);
    return normalizeProfiles(conf.get('projectProfiles'));
}
