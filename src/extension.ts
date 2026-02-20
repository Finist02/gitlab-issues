// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitlabUser, GitlabUsersProvider } from './gitlabUsersProvider';
import { FavoriteItem, UsersFavoritesTreeProvider } from './gitlabFavoriteProvider';
import { AuthService } from './authService';

export function activate(context: vscode.ExtensionContext) {
	const extensionPath = context.extensionPath;
	const auth = new AuthService(context);
	const gitlabUsers = new GitlabUsersProvider(context, extensionPath, auth);
	const usersFavoritesProvider = new UsersFavoritesTreeProvider(extensionPath);
	context.subscriptions.push(
		vscode.window.createTreeView('UsersGitlab', { treeDataProvider: gitlabUsers }),
		vscode.window.createTreeView('FavoritesGitlab', { treeDataProvider: usersFavoritesProvider })
	);

	context.subscriptions.push(vscode.commands.registerCommand('UsersGitlab.addToFavorites', (node: GitlabUser) => {
		gitlabUsers.addToFavorites(node);
		usersFavoritesProvider.refresh();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('UsersGitlab.viewIssues', (userId: string, userName: string) => { gitlabUsers.viewIssues(userId, userName); }));
	context.subscriptions.push(vscode.commands.registerCommand('UsersGitlab.refreshEntry', () => gitlabUsers.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('FavoritesGitlab.refreshFavorites', () => usersFavoritesProvider.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('FavoritesGitlab.removeFromFavorites', (item: FavoriteItem) => usersFavoritesProvider.removeFromFavorites(item)));
}

// This method is called when your extension is deactivated
export function deactivate() { }
