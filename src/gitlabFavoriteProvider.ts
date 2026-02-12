import * as vscode from 'vscode';
import * as path from 'path';
import { UsersFavorite } from './usersFavorite';

/**
 * @brief Провайдер для отображения избранных DPE элементов
 * @details Создает отдельное представление в DPES EXPLORER для показа избранного списка
 */
export class UsersFavoritesTreeProvider implements vscode.TreeDataProvider<FavoriteItem> {
    private dpeFavorites: UsersFavorite;
    private _onDidChangeTreeData: vscode.EventEmitter<FavoriteItem | undefined | void> = new vscode.EventEmitter<FavoriteItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FavoriteItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private readonly extensionPath: string) {
        this.dpeFavorites = new UsersFavorite();
    }

    /**
     * @brief Обновляет представление избранного
     */
    refresh(): void {
        // Перезагружаем данные из файла
        this.dpeFavorites = new UsersFavorite();
        this._onDidChangeTreeData.fire();
    }

    /**
     * @brief Получает элемент дерева
     * @param element Элемент для отображения
     * @return Элемент дерева
     */
    getTreeItem(element: FavoriteItem): vscode.TreeItem {
        return element;
    }
    /**
     * @brief Получает дочерние элементы
     * @param element Родительский элемент (не используется)
     * @return Массив избранных элементов
     */
    getChildren(element?: FavoriteItem): Thenable<FavoriteItem[]> {
        const favorites = this.dpeFavorites.getFavorites();
        const items = favorites.map(fav => new FavoriteItem(
            fav.label, // Показываем ID как основной текст
            fav.id,
            fav.label, // Передаем label для tooltip
            this.extensionPath,
            // Возвращаем команду клика для показа истории
            {
                command: 'UsersGitlab.viewIssues',
                title: 'Показать задачи пользователя',
                arguments: [fav.id, fav.label] // Передаем ID элемента и его label
            }
        ));

        return Promise.resolve(items);
    }

    /**
     * @brief Удаляет элемент из избранного
     * @param item Элемент для удаления
     */
    removeFromFavorites(item: FavoriteItem): void {
        this.dpeFavorites.removeFromFavorites(item.id);
        this.refresh();
    }
}

/**
 * @brief Класс для элемента избранного в дереве
 */
export class FavoriteItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly originalLabel?: string,
        extensionPath?: string,
        public readonly command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        // Tooltip показывает и ID и оригинальный label
        this.tooltip = this.originalLabel ? `${this.originalLabel}\nID: ${this.id}` : `ID: ${this.id}`;
        this.contextValue = 'favorite-item';
        this.command = command; // Устанавливаем команду клика для показа истории
        const basePath = extensionPath ?? __dirname;
        this.iconPath = {
            light: vscode.Uri.file(path.join(basePath, 'images', 'light', 'UserCheck.png')),
            dark: vscode.Uri.file(path.join(basePath, 'images', 'dark', 'UserCheck.png'))
        };
    }
}
