import * as vscode from 'vscode';
import * as path from 'path';
import { UsersFavorite } from './usersFavorite';

/**
 * Провайдер дерева избранных пользователей GitLab
 */
export class UsersFavoritesTreeProvider implements vscode.TreeDataProvider<FavoriteItem> {
    private userFavorites: UsersFavorite;
    private _onDidChangeTreeData: vscode.EventEmitter<FavoriteItem | undefined | void> = new vscode.EventEmitter<FavoriteItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FavoriteItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private readonly extensionPath: string) {
        this.userFavorites = new UsersFavorite();
    }

    refresh(): void {
        this.userFavorites = new UsersFavorite();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FavoriteItem): vscode.TreeItem {
        return element;
    }

    getChildren(_element?: FavoriteItem): Thenable<FavoriteItem[]> {
        const favorites = this.userFavorites.getFavorites();
        const items = favorites.map(fav => new FavoriteItem(
            fav.label, // Показываем ID как основной текст
            fav.id,
            fav.label, // Передаем label для tooltip
            this.extensionPath,
            // Возвращаем команду клика для показа истории
            { command: 'UsersGitlab.viewIssues', title: 'Показать задачи', arguments: [fav.id, fav.label] }
        ));

        return Promise.resolve(items);
    }

    async removeFromFavorites(item: FavoriteItem): Promise<void> {
        await this.userFavorites.removeFromFavorites(item.id);
        this.refresh();
    }
}

export class FavoriteItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly originalLabel?: string,
        extensionPath?: string,
        public readonly command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = this.originalLabel ? `${this.originalLabel}\nID: ${this.id}` : `ID: ${this.id}`;
        this.contextValue = 'favorite-item';
        this.command = command;
        const basePath = extensionPath ?? __dirname;
        this.iconPath = {
            light: vscode.Uri.file(path.join(basePath, 'images', 'light', 'UserCheck.png')),
            dark: vscode.Uri.file(path.join(basePath, 'images', 'dark', 'UserCheck.png'))
        };
    }
}
