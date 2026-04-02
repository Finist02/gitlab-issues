import * as vscode from 'vscode';
import type { GitlabIssue } from './gitlabApi';

const CONFIG_SECTION = 'gitlabIssues';

export const DEFAULT_GANTT_LABELS_DONE = ['Отработано', 'Отработано: развернуто', 'UnderValidation'];
export const DEFAULT_GANTT_LABELS_ACTIVE = ['В процессе'];

export function normalizeIssueLabels(issue: GitlabIssue): string[] {
    const raw = issue.labels;
    if (!raw || !Array.isArray(raw)) {
        return [];
    }
    return raw
        .map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            }
            if (entry && typeof entry === 'object' && 'name' in entry) {
                return String((entry as { name?: string }).name ?? '');
            }
            return '';
        })
        .filter(Boolean);
}

/** Для сравнения лейблов GitLab (регистр, пробелы вокруг `:`). */
export function canonicalLabelName(l: string): string {
    return l
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*:\s*/g, ':');
}

function normalizeStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.map((x) => String(x).trim()).filter(Boolean);
}

export function getGanttLabelRules(): { done: string[]; active: string[] } {
    const conf = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const doneCustom = normalizeStringArray(conf.get('ganttLabelsDone'));
    const activeCustom = normalizeStringArray(conf.get('ganttLabelsActive'));
    return {
        done: doneCustom.length > 0 ? doneCustom : DEFAULT_GANTT_LABELS_DONE,
        active: activeCustom.length > 0 ? activeCustom : DEFAULT_GANTT_LABELS_ACTIVE
    };
}

/**
 * Как в Mermaid Gantt: **done** приоритетнее **active**.
 */
export function classifyIssueGanttStatus(
    labels: string[],
    donePatterns: string[],
    activePatterns: string[]
): 'active' | 'done' | undefined {
    const doneCanon = new Set(donePatterns.map((p) => canonicalLabelName(p)));
    const activeCanon = new Set(activePatterns.map((p) => canonicalLabelName(p)));
    const issueCanon = labels.map((x) => canonicalLabelName(x));
    const hasDone = issueCanon.some((c) => doneCanon.has(c));
    if (hasDone) {
        return 'done';
    }
    const hasActive = issueCanon.some((c) => activeCanon.has(c));
    if (hasActive) {
        return 'active';
    }
    return undefined;
}

/** Задача «в процессе» в смысле Gantt (только `active`, не `done`). */
export function issueIsInProgressByGanttLabels(issue: GitlabIssue): boolean {
    const rules = getGanttLabelRules();
    const labelStrs = normalizeIssueLabels(issue);
    return classifyIssueGanttStatus(labelStrs, rules.done, rules.active) === 'active';
}
