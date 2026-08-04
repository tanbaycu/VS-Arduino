import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ArduinoCliManager } from './ArduinoCliManager';

type CommandItem = vscode.QuickPickItem & { value: string };

const HISTORY_KEY = 'vs-arduino.cliCommandHistory';
const HISTORY_LIMIT = 15;
const PROMPT_IDLE_MS = 1000;
const CONFIRM_PATTERN = /[[(][yYnN][\/|][yYnN][\])]/;
const PROMPT_PATTERN = /\?\s*$|[[(][yYnN][\/|][yYnN][\])]\s*$|\b(?:enter|type|input|choose|select|specify|password|username|answer)\b[^:\n]*:\s*$/i;

const SUGGESTED_COMMANDS = [
    'arduino-cli version',
    'arduino-cli board list',
    'arduino-cli lib list',
    'arduino-cli core list',
    'arduino-cli outdated',
    'arduino-cli update',
    'arduino-cli config dump',
    'arduino-cli cache clean'
];

export class CliCommandRunner {
    private activeProcess: ChildProcess | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: vscode.OutputChannel,
        private cliManager: ArduinoCliManager
    ) {}

    public async run(): Promise<void> {
        if (this.activeProcess) {
            vscode.window.showWarningMessage('An arduino-cli command is already running. Wait for it to finish.');
            return;
        }

        const commandLine = await this.pickCommand();
        if (!commandLine) {
            return;
        }

        await this.rememberCommand(commandLine);
        await this.execute(commandLine);
    }

    private pickCommand(): Promise<string | undefined> {
        return new Promise(resolve => {
            const history = this.context.globalState.get<string[]>(HISTORY_KEY, []);
            const suggestions = SUGGESTED_COMMANDS.filter(command => !history.includes(command));
            const baseItems: CommandItem[] = [
                ...history.map(command => ({ label: `$(history) ${command}`, description: 'Recent', value: command })),
                ...suggestions.map(command => ({ label: `$(terminal) ${command}`, description: 'Suggested', value: command }))
            ];

            const quickPick = vscode.window.createQuickPick<CommandItem>();
            quickPick.title = 'Run arduino-cli Command';
            quickPick.placeholder = 'Type a full command and press Enter, e.g. arduino-cli lib list';
            quickPick.items = baseItems;
            quickPick.matchOnDescription = true;

            quickPick.onDidChangeValue(value => {
                const typed = value.trim();
                quickPick.items = typed
                    ? [{ label: typed, description: '$(play) Run this command', alwaysShow: true, value: typed }, ...baseItems]
                    : baseItems;
            });

            let resolved = false;
            const finish = (result: string | undefined) => {
                if (resolved) {
                    return;
                }
                resolved = true;
                quickPick.hide();
                quickPick.dispose();
                resolve(result);
            };

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0]?.value ?? quickPick.value;
                const trimmed = selected.trim();
                finish(trimmed.length > 0 ? trimmed : undefined);
            });
            quickPick.onDidHide(() => finish(undefined));
            quickPick.show();
        });
    }

    private async rememberCommand(commandLine: string): Promise<void> {
        const history = this.context.globalState.get<string[]>(HISTORY_KEY, []);
        const updated = [commandLine, ...history.filter(entry => entry !== commandLine)].slice(0, HISTORY_LIMIT);
        await this.context.globalState.update(HISTORY_KEY, updated);
    }

    private async execute(commandLine: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('vs-arduino');
        const cliPath = config.get<string>('arduinoCliPath') || 'arduino-cli';
        const dataDir = config.get<string>('arduinoDataDir');

        const userArgs = commandLine.replace(/^\s*(?:"[^"]*arduino-cli[^"]*"|arduino-cli(?:\.exe)?)\s*/i, '').trim();
        if (!userArgs) {
            vscode.window.showErrorMessage('Enter an arduino-cli subcommand, for example "arduino-cli lib list".');
            return;
        }

        const configArgs = /--config-file/.test(userArgs) ? [] : await this.cliManager.getConfigFileArg();
        const configPart = configArgs.length > 0 ? `${configArgs[0]} "${configArgs[1]}" ` : '';
        const displayCommand = `arduino-cli ${userArgs}`;

        this.outputChannel.show(true);
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`[Command "${displayCommand}"]`);

        const env = dataDir ? { ...process.env, ARDUINO_DIRECTORIES_USER: dataDir } : process.env;
        const child = spawn(`"${cliPath}" ${configPart}${userArgs}`, { shell: true, env });
        this.activeProcess = child;

        let pendingPrompt = '';
        let promptTimer: NodeJS.Timeout | undefined;
        let promptOpen = false;

        const clearPromptTimer = () => {
            if (promptTimer) {
                clearTimeout(promptTimer);
                promptTimer = undefined;
            }
        };

        const consume = (chunk: Buffer) => {
            const text = chunk.toString();
            this.outputChannel.append(text);

            const tail = text.slice(Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r')) + 1).trim();
            clearPromptTimer();
            if (promptOpen || tail.length === 0 || !PROMPT_PATTERN.test(tail)) {
                return;
            }
            pendingPrompt = tail;
            promptTimer = setTimeout(async () => {
                promptOpen = true;
                const answer = await this.askForInput(displayCommand, pendingPrompt);
                promptOpen = false;
                if (answer === undefined) {
                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine('[Command] Input cancelled, closing the command input stream.');
                    child.stdin?.end();
                    return;
                }
                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(`[Input] ${answer}`);
                child.stdin?.write(`${answer}\n`);
            }, PROMPT_IDLE_MS);
        };

        await new Promise<void>(resolve => {
            child.stdout?.on('data', consume);
            child.stderr?.on('data', consume);

            child.on('close', code => {
                clearPromptTimer();
                this.activeProcess = undefined;
                this.outputChannel.appendLine('');
                if (code === 0) {
                    this.outputChannel.appendLine(`[Command] Completed successfully: ${displayCommand}`);
                } else {
                    this.outputChannel.appendLine(`[Command] Failed with exit code ${code}: ${displayCommand}`);
                }
                resolve();
            });

            child.on('error', error => {
                clearPromptTimer();
                this.activeProcess = undefined;
                this.outputChannel.appendLine(`[Command] Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to run arduino-cli: ${error.message}`);
                resolve();
            });
        });
    }

    private async askForInput(displayCommand: string, prompt: string): Promise<string | undefined> {
        if (CONFIRM_PATTERN.test(prompt)) {
            const picked = await vscode.window.showQuickPick(
                [
                    { label: '$(check) Yes', value: 'y' },
                    { label: '$(x) No', value: 'n' }
                ],
                { title: `arduino-cli: ${prompt}`, placeHolder: `The command "${displayCommand}" is waiting for an answer` }
            );
            return picked?.value;
        }

        return vscode.window.showInputBox({
            title: `arduino-cli: ${prompt}`,
            prompt: `The command "${displayCommand}" is waiting for an answer`,
            placeHolder: 'Type your answer and press Enter',
            ignoreFocusOut: true
        });
    }
}
