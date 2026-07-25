import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ArduinoCliManager } from './ArduinoCliManager';

type ExampleNode = {
    name: string;
    path?: string;
    children?: ExampleNode[];
};

type ExampleEntry = {
    library?: { name?: string };
    examples?: string[];
};

function insertPath(nodes: ExampleNode[], segments: string[], fullPath: string) {
    const [head, ...rest] = segments;
    if (rest.length === 0) {
        nodes.push({ name: head, path: fullPath });
        return;
    }
    let folder = nodes.find(node => node.children && node.name === head);
    if (!folder) {
        folder = { name: head, children: [] };
        nodes.push(folder);
    }
    insertPath(folder.children!, rest, fullPath);
}

function sortTree(nodes: ExampleNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const node of nodes) {
        if (node.children) {
            sortTree(node.children);
        }
    }
}

function pathsToTree(paths: string[]): ExampleNode[] {
    const nodes: ExampleNode[] = [];
    for (const raw of paths) {
        const normalized = raw.replace(/\\/g, '/');
        const marker = normalized.toLowerCase().lastIndexOf('/examples/');
        const relative = marker >= 0 ? normalized.slice(marker + '/examples/'.length) : normalized;
        const segments = relative.split('/').filter(Boolean);
        if (segments.length === 0) {
            continue;
        }
        insertPath(nodes, segments, raw);
    }
    sortTree(nodes);
    return nodes;
}

function buildExampleTree(entries: ExampleEntry[], groupByLibrary: boolean): ExampleNode[] {
    if (!groupByLibrary) {
        return pathsToTree(entries.flatMap(entry => entry.examples ?? []));
    }
    const groups: ExampleNode[] = [];
    for (const entry of entries) {
        const children = pathsToTree(entry.examples ?? []);
        if (children.length === 0) {
            continue;
        }
        groups.push({ name: entry.library?.name ?? 'Unknown', children });
    }
    sortTree(groups);
    return groups;
}

export class ExampleBrowser {
    constructor(private cliManager: ArduinoCliManager) {}

    public async browse(itemName: string, type: 'library' | 'core'): Promise<void> {
        const entries = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Loading examples for ${itemName}...`,
            cancellable: false
        }, async () => {
            if (type === 'library') {
                return this.cliManager.getLibraryExamples(itemName);
            }
            return this.cliManager.getCoreExamples(itemName);
        });

        const tree = buildExampleTree(entries, type === 'core');
        if (tree.length === 0) {
            vscode.window.showInformationMessage(`No examples found for ${itemName}.`);
            return;
        }

        const examplePath = await this.pickExample(itemName, tree);
        if (!examplePath) {
            return;
        }

        await this.openExample(examplePath);
    }

    private async pickExample(itemName: string, tree: ExampleNode[]): Promise<string | undefined> {
        const stack: ExampleNode[][] = [tree];
        const breadcrumbs: string[] = [itemName];

        while (true) {
            const nodes = stack[stack.length - 1];
            const items: (vscode.QuickPickItem & { node?: ExampleNode; isBack?: boolean })[] = [];

            if (stack.length > 1) {
                items.push({ label: '$(arrow-left) Back', isBack: true });
            }

            for (const node of nodes) {
                items.push({
                    label: node.children ? `$(folder) ${node.name}` : `$(file-code) ${node.name}`,
                    description: node.children ? `${node.children.length} item(s)` : undefined,
                    node
                });
            }

            const picked = await vscode.window.showQuickPick(items, {
                title: `Examples: ${breadcrumbs.join(' > ')}`,
                placeHolder: 'Select an example sketch to open'
            });

            if (!picked) {
                return undefined;
            }
            if (picked.isBack) {
                stack.pop();
                breadcrumbs.pop();
                continue;
            }
            if (picked.node?.children) {
                stack.push(picked.node.children);
                breadcrumbs.push(picked.node.name);
                continue;
            }
            return picked.node?.path;
        }
    }

    private async openExample(examplePath: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('vs-arduino');
        let target = config.get<string>('exampleOpenTarget', 'ask');

        if (target === 'ask') {

            const newWindow = 'New Window';
            const currentWindow = 'This Window';
            const choice = await vscode.window.showInformationMessage(
                'Open the example sketch in a new window or this window? It will be copied to your sketchbook first.',
                newWindow,
                currentWindow
            );

            if (!choice) {
                return;
            }
            target = choice === newWindow ? 'newWindow' : 'currentWindow';

            if (config.get<boolean>('exampleOpenAskToSetDefault', true)) {
                const setDefault = 'Set as Default';
                const noThanks = 'No, Thanks';
                const dontAskAgain = "Don't Ask Again";
                const remember = await vscode.window.showInformationMessage(
                    `Always open examples in the ${choice.toLowerCase()} from now on?`,
                    { modal: true },
                    setDefault,
                    noThanks,
                    dontAskAgain
                );

                if (remember === setDefault) {
                    await config.update('exampleOpenTarget', target, vscode.ConfigurationTarget.Global);
                } else if (remember === dontAskAgain) {

                    await config.update('exampleOpenAskToSetDefault', false, vscode.ConfigurationTarget.Global);
                }
            }
        }

        try {
            const sketchbookDir = config.get<string>('sketchbookPath') || await this.cliManager.getSketchbookDir();
            if (!sketchbookDir) {
                vscode.window.showErrorMessage('Could not determine the sketchbook directory. Set "vs-arduino.sketchbookPath" and try again.');
                return;
            }

            const exampleName = path.basename(examplePath);
            let destDir = path.join(sketchbookDir, exampleName);
            let suffix = 2;
            while (fs.existsSync(destDir)) {
                destDir = path.join(sketchbookDir, `${exampleName}_${suffix}`);
                suffix++;
            }

            await fs.promises.cp(examplePath, destDir, { recursive: true });

            const destName = path.basename(destDir);
            if (destName !== exampleName) {
                const originalIno = path.join(destDir, `${exampleName}.ino`);
                if (fs.existsSync(originalIno)) {
                    await fs.promises.rename(originalIno, path.join(destDir, `${destName}.ino`));
                }
            }

            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(destDir),
                { forceNewWindow: target === 'newWindow' }
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open example: ${error}`);
        }
    }
}
