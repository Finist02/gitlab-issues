import * as vscode from 'vscode';

/**
 * Заглушка: выбор активного профиля больше не хранится в настройках.
 * Теперь профиль выбирается внутри команды экспорта (или сразу “Все профили”).
 */
export async function selectProjectProfile(): Promise<void> {
    void vscode.window.showInformationMessage(
        'Выбор профиля убран из статуса. Используйте команду “GitLab Issues: Export project overview” и выберите нужный профиль или “Все профили”.'
    );
}
