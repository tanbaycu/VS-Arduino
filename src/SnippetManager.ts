import * as vscode from 'vscode';

const SNIPPETS_KEY = 'vs-arduino.snippets';

interface Snippet {
    name: string;
    body: string;
}

export class SnippetManager {
    constructor(private context: vscode.ExtensionContext) {}

    async createSnippet(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const selected = editor ? editor.document.getText(editor.selection) : '';

        const name = await vscode.window.showInputBox({
            prompt: 'Snippet name',
            placeHolder: 'e.g. Serial debug print',
            validateInput: v => v.trim() ? undefined : 'Name cannot be empty'
        });
        if (!name) { return; }

        const body = await vscode.window.showInputBox({
            prompt: 'Snippet body (use $1, ${1:placeholder} for tab stops)',
            value: selected,
            placeHolder: 'Serial.println($1);'
        });
        if (body === undefined) { return; }

        const snippets = this.load();
        const idx = snippets.findIndex(s => s.name === name.trim());
        if (idx >= 0) {
            snippets[idx].body = body;
        } else {
            snippets.push({ name: name.trim(), body });
        }
        await this.save(snippets);
        vscode.window.showInformationMessage(`Snippet "${name.trim()}" saved.`);
    }

    async insertSnippet(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open a file to insert a snippet.');
            return;
        }

        const snippets = this.load();
        if (snippets.length === 0) {
            vscode.window.showInformationMessage('No snippets yet. Create one with "VS Arduino: Create Snippet".');
            return;
        }

        const items = snippets.map(s => ({
            label: s.name,
            description: s.body.length > 60 ? s.body.slice(0, 57) + '...' : s.body,
            snippet: s
        }));

        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a snippet to insert' });
        if (!picked) { return; }

        await editor.insertSnippet(new vscode.SnippetString(picked.snippet.body));
    }

    async deleteSnippet(): Promise<void> {
        const snippets = this.load();
        if (snippets.length === 0) {
            vscode.window.showInformationMessage('No snippets to delete.');
            return;
        }

        const items = snippets.map(s => ({
            label: s.name,
            description: s.body.length > 60 ? s.body.slice(0, 57) + '...' : s.body,
            snippet: s
        }));

        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a snippet to delete' });
        if (!picked) { return; }

        const updated = snippets.filter(s => s.name !== picked.snippet.name);
        await this.save(updated);
        vscode.window.showInformationMessage(`Snippet "${picked.snippet.name}" deleted.`);
    }

    private load(): Snippet[] {
        return this.context.globalState.get<Snippet[]>(SNIPPETS_KEY, []);
    }

    private async save(snippets: Snippet[]): Promise<void> {
        await this.context.globalState.update(SNIPPETS_KEY, snippets);
    }
}
