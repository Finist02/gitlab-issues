// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitlabUser, GitlabUsersProvider } from './gitlabUsersProvider';
import { FavoriteItem, UsersFavoritesTreeProvider } from './gitlabFavoriteProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const extensionPath = context.extensionPath;

	const gitlabUsers = new GitlabUsersProvider(context, extensionPath);
	const usersFavoritesProvider = new UsersFavoritesTreeProvider(extensionPath);
	const treeView = vscode.window.createTreeView('UsersGitlab', { treeDataProvider: gitlabUsers });
	const favoritesTreeView = vscode.window.createTreeView('FavoritesGitlab', { treeDataProvider: usersFavoritesProvider });

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
