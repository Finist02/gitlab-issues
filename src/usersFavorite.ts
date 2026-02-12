import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
interface IUserFavorite {
	id: string;
	label: string;
}

function getVSCodeFilePath(fileName: string): string {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceRoot) {
		throw new Error('No workspace folder found. Please open a folder in VS Code to use this extension.');
	}
	
	const vsCodeDir = path.join(workspaceRoot, '.vscode');
	if (!fs.existsSync(vsCodeDir)) {
		fs.mkdirSync(vsCodeDir, { recursive: true });
	}
	
	return path.join(vsCodeDir, fileName);
}
/**
 * @brief Безопасная загрузка JSON файла
 * @details Загружает и парсит JSON файл с обработкой ошибок
 * @tparam T Тип возвращаемых данных
 * @param filePath Путь к файлу
 * @param defaultValue Значение по умолчанию при ошибке
 * @return Загруженные данные или значение по умолчанию
 */
export function loadJsonFile<T>(filePath: string, defaultValue: T): T {
	try {
		if (fs.existsSync(filePath)) {
			const data = fs.readFileSync(filePath, 'utf8');
			return JSON.parse(data);
		}
		return defaultValue;
	} catch (error) {
		return defaultValue;
	}
}

/**
 * @brief Безопасное сохранение данных в JSON файл
 * @details Сохраняет данные в JSON формате с обработкой ошибок
 * @tparam T Тип сохраняемых данных
 * @param filePath Путь к файлу
 * @param data Данные для сохранения
 * @return true если сохранение успешно
 */
export function saveJsonFile<T>(filePath: string, data: T): boolean {
	try {
		const vsCodeDir = path.dirname(filePath);
		if (!fs.existsSync(vsCodeDir)) {
			fs.mkdirSync(vsCodeDir, { recursive: true });
		}
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
		return true;
	} catch (error) {
		return false;
	}
}
export class UsersFavorite {
	private favorites: IUserFavorite[] = [];
	private favoritesFilePath: string;
	constructor() {
		this.favoritesFilePath = getVSCodeFilePath('user-issue-favorites.json');
		this.loadFavorites();
	}	/**
	 * @brief Загружает избранные из файла
	 */
	private loadFavorites(): void {
		this.favorites = loadJsonFile<IUserFavorite[]>(this.favoritesFilePath, []);
		// Убеждаемся что загрузили массив
		if (!Array.isArray(this.favorites)) {
			this.favorites = [];
		}
	}

	/**
	 * @brief Сохраняет избранные в файл
	 */
	private saveFavorites(): void {
		saveJsonFile(this.favoritesFilePath, this.favorites);
	}
	/**
	 * @brief Добавляет DPE элемент в избранное
	 * @param id ID элемента
	 * @param label Название элемента
	 */
	addToFavorites(id: string, label: string): void {
		// Убеждаемся что favorites - это массив
		if (!Array.isArray(this.favorites)) {
			this.favorites = [];
		}
		
		if (!this.isFavorite(id)) {
			this.favorites.push({
				id,
				label
			});
			this.saveFavorites();
		}
	}

	/**
	 * @brief Удаляет DPE элемент из избранного
	 * @param id ID элемента
	 */
	removeFromFavorites(id: string): void {
		this.favorites = this.favorites.filter(fav => fav.id !== id);
		this.saveFavorites();
	}
	/**
	 * @brief Проверяет, находится ли элемент в избранном
	 * @param id ID элемента
	 * @return true если элемент в избранном
	 */
	isFavorite(id: string): boolean {
		// Убеждаемся что favorites - это массив
		if (!Array.isArray(this.favorites)) {
			this.favorites = [];
			return false;
		}
		return this.favorites.some(fav => fav.id === id);
	}
	/**
	 * @brief Получает все избранные элементы
	 * @return Массив избранных элементов
	 */
	getFavorites(): IUserFavorite[] {
		// Убеждаемся что favorites - это массив
		if (!Array.isArray(this.favorites)) {
			this.favorites = [];
		}
		return this.favorites;
	}
}
