// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitlabUser, GitlabUsersProvider } from './gitlabUsersProvider';
import { FavoriteItem, UsersFavoritesTreeProvider } from './gitlabFavoriteProvider';
import { AuthService } from './authService';
import { exportDailyStandup } from './dailyStandupExport';
import { migrateLegacyFavoritesIfNeeded } from './usersFavorite';
import { exportProjectOverview } from './projectExport';

export function activate(context: vscode.ExtensionContext) {
	const extensionPath = context.extensionPath;
	const auth = new AuthService(context);
	const gitlabUsers = new GitlabUsersProvider(context, extensionPath, auth);
	const usersFavoritesProvider = new UsersFavoritesTreeProvider(extensionPath);
	void migrateLegacyFavoritesIfNeeded().then(() => usersFavoritesProvider.refresh());

	context.subscriptions.push(
		vscode.window.createTreeView('UsersGitlab', { treeDataProvider: gitlabUsers }),
		vscode.window.createTreeView('FavoritesGitlab', { treeDataProvider: usersFavoritesProvider })
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('gitlabIssues.favoriteUsers')) {
				usersFavoritesProvider.refresh();
			}
		})
	);

	context.subscriptions.push(vscode.commands.registerCommand('UsersGitlab.addToFavorites', async (node: GitlabUser) => {
		await gitlabUsers.addToFavorites(node);
		usersFavoritesProvider.refresh();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('UsersGitlab.viewIssues', (userId: string, userName: string) => { gitlabUsers.viewIssues(userId, userName); }));
	context.subscriptions.push(vscode.commands.registerCommand('UsersGitlab.refreshEntry', () => gitlabUsers.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('FavoritesGitlab.refreshFavorites', () => usersFavoritesProvider.refresh()));
	context.subscriptions.push(
		vscode.commands.registerCommand('FavoritesGitlab.removeFromFavorites', async (item: FavoriteItem) => {
			await usersFavoritesProvider.removeFromFavorites(item);
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('UsersGitlab.exportDailyStandup', () => exportDailyStandup(auth))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('UsersGitlab.exportProjectOverview', () => exportProjectOverview(auth))
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
