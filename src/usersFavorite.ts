import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface FavoriteEntry {
    id: string;
    label: string;
}

const FAVORITES_FILE = 'user-issue-favorites.json';

function getFavoritesFilePath(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        throw new Error('Откройте папку в VS Code для использования расширения.');
    }
    const vsCodeDir = path.join(workspaceRoot, '.vscode');
    if (!fs.existsSync(vsCodeDir)) {
        fs.mkdirSync(vsCodeDir, { recursive: true });
    }
    return path.join(vsCodeDir, FAVORITES_FILE);
}

function loadJson<T>(filePath: string, defaultValue: T): T {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
        }
    } catch {
        // ignore
    }
    return defaultValue;
}

function saveJson<T>(filePath: string, data: T): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export class UsersFavorite {
    private favorites: FavoriteEntry[] = [];
    private readonly filePath: string;

    constructor() {
        this.filePath = getFavoritesFilePath();
        this.load();
    }

    private load(): void {
        const data = loadJson<FavoriteEntry[]>(this.filePath, []);
        this.favorites = Array.isArray(data) ? data : [];
    }

    private save(): void {
        saveJson(this.filePath, this.favorites);
    }

    addToFavorites(id: string, label: string): void {
        if (!this.favorites.some((f) => f.id === id)) {
            this.favorites.push({ id, label });
            this.save();
        }
    }

    removeFromFavorites(id: string): void {
        this.favorites = this.favorites.filter((f) => f.id !== id);
        this.save();
    }

    isFavorite(id: string): boolean {
        return this.favorites.some((f) => f.id === id);
    }

    getFavorites(): FavoriteEntry[] {
        return [...this.favorites];
    }
}
