import * as vscode from 'vscode';
import * as _path from 'path';

import { IJEManager } from './i18n-arb-editor/ije-manager';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('i18n-arb-editor', (uri: vscode.Uri) => {

			const panel = vscode.window.createWebviewPanel(
				'i18n-arb-editor',
				'i18n-arb-editor',
				vscode.ViewColumn.One,
				{
					retainContextWhenHidden: true,
					enableScripts: true,
					localResourceRoots: [
						vscode.Uri.file(_path.join(context.extensionPath, 'media')) //
					]
				}

			);

			const manager = new IJEManager(context, vscode.workspace.getConfiguration(), panel, uri.fsPath);

		})
	);
}
