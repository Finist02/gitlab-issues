import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FavoriteEntry {
    id: string;
    label: string;
}

const CONFIG_SECTION = 'gitlabIssues';
const FAVORITES_KEY = 'favoriteUsers';

const LEGACY_FILE = 'user-issue-favorites.json';

function normalizeEntries(raw: unknown): FavoriteEntry[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: FavoriteEntry[] = [];
    for (const item of raw) {
        if (item && typeof item === 'object' && 'id' in item) {
            const id = String((item as { id: unknown }).id);
            const label = String((item as { label?: unknown }).label ?? '');
            if (id) {
                out.push({ id, label });
            }
        }
    }
    return out;
}

/**
 * Одноразовый перенос из `.vscode/user-issue-favorites.json` в настройки, если избранное в конфиге пустое.
 */
export async function migrateLegacyFavoritesIfNeeded(): Promise<void> {
    const conf = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const current = normalizeEntries(conf.get(FAVORITES_KEY));
    if (current.length > 0) {
        return;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        return;
    }

    const legacyPath = path.join(root, '.vscode', LEGACY_FILE);
    if (!fs.existsSync(legacyPath)) {
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(legacyPath, 'utf-8')) as unknown;
        const migrated = normalizeEntries(data);
        if (migrated.length === 0) {
            return;
        }
        await conf.update(FAVORITES_KEY, migrated, vscode.ConfigurationTarget.Global);
        fs.unlinkSync(legacyPath);
    } catch {
        // ignore corrupt legacy file
    }
}

export class UsersFavorite {
    private favorites: FavoriteEntry[] = [];

    constructor() {
        this.load();
    }

    private load(): void {
        const conf = vscode.workspace.getConfiguration(CONFIG_SECTION);
        this.favorites = normalizeEntries(conf.get(FAVORITES_KEY));
    }

    private async persist(): Promise<void> {
        const conf = vscode.workspace.getConfiguration(CONFIG_SECTION);
        await conf.update(FAVORITES_KEY, this.favorites, vscode.ConfigurationTarget.Global);
    }

    async addToFavorites(id: string, label: string): Promise<void> {
        this.load();
        if (!this.favorites.some((f) => f.id === id)) {
            this.favorites.push({ id, label });
            await this.persist();
        }
    }

    async removeFromFavorites(id: string): Promise<void> {
        this.load();
        this.favorites = this.favorites.filter((f) => f.id !== id);
        await this.persist();
    }

    isFavorite(id: string): boolean {
        this.load();
        return this.favorites.some((f) => f.id === id);
    }

    getFavorites(): FavoriteEntry[] {
        this.load();
        return [...this.favorites];
    }
}
