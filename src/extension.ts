'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as  fs from 'fs';
import { TSJSToggle, RawPosition, FindFilePos } from './toggle';


const EXT_TS = ".ts";
const EXT_JS = ".js";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "tjgogo" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.tjgogo', () => {
        // The code you place here will be executed every time your command is executed

        // Display a message box to the user

        if (vscode.window.activeTextEditor) {
            const current = vscode.window.activeTextEditor.document.fileName;
            const ext = path.extname(current);
            if (ext !== EXT_TS && ext !== EXT_JS) {
                vscode.window.showInformationMessage('You are try to toggle js/ts file.But now activeTextEditor is not js/ts');
                return;
            }
            fs.stat(current, (err, stats) => {
                if (err) {
                    vscode.window.showInformationMessage('cannot find ' + current + ' in your filesystem');
                    return;
                }
                if (vscode.window.activeTextEditor) {
                    const line = vscode.window.activeTextEditor.selection.active.line;
                    const column = vscode.window.activeTextEditor.selection.active.character;
                    tsjsgo(current, { line, column });
                }
            });

        } else {
            vscode.window.showInformationMessage('NO activeTextEditor now');
        }
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function tsjsgo(filepath: string, pos: RawPosition) {
    const toggleobj = new TSJSToggle();
    toggleobj.Init(filepath, pos);
    toggleobj.GetSwitchPosition((result: FindFilePos | undefined) => {
        if (result) {
            vscode.workspace.openTextDocument(result.file).then(doc => {
                let page: vscode.ViewColumn = 1;
                if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.viewColumn) {
                    page = vscode.window.activeTextEditor.viewColumn;
                }
                let startpos = new vscode.Position(result.postion.line, result.postion.column);
                let endpos = startpos;
                let range = new vscode.Range(startpos, endpos);
                let opts: vscode.TextDocumentShowOptions = {
                    viewColumn: page,
                    selection: range,
                }
                vscode.window.showTextDocument(doc, opts);
            });
        }
    });
}