import * as vscode from 'vscode';
import * as path from 'path';

const CORE_RELATIVE_ROOT = path.join('src', 'debugger', 'cortex-debug-core');
const EMBEDDED_DEBUG_TYPE = 'vs-arduino-cortex-debug';

const TRACKED_DEBUGGER_SETTINGS = [
    { section: 'memory-view', key: 'trackDebuggers' },
    { section: 'mcu-debug.rtos-views', key: 'trackDebuggers' }
];

const MCU_DEBUG_EXTENSION_IDS = [
    'mcu-debug.debug-tracker-vscode',
    'mcu-debug.memory-view',
    'mcu-debug.rtos-views',
    'mcu-debug.peripheral-viewer'
];

interface CortexDebugCoreModule {
    activate(context: vscode.ExtensionContext): unknown;
    deactivate(): void;
}

let coreModule: CortexDebugCoreModule | undefined;

export function activateCortexDebugCore(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
    const coreRoot = path.join(context.extensionPath, CORE_RELATIVE_ROOT);
    try {
        coreModule = require(path.join(coreRoot, 'dist', 'extension.js')) as CortexDebugCoreModule;
        coreModule.activate(createCoreExtensionContext(context, coreRoot));
        outputChannel.appendLine('[Debug] Embedded Cortex-Debug core activated.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[Debug] Failed to activate embedded Cortex-Debug core: ${errorMessage}`);
        vscode.window.showErrorMessage(`VS Arduino: failed to start the embedded debugger core: ${errorMessage}`);
    }
}

export function deactivateCortexDebugCore(): void {
    coreModule?.deactivate();
    coreModule = undefined;
}

export async function ensureMcuDebugCompanions(outputChannel: vscode.OutputChannel): Promise<void> {
    for (const { section, key } of TRACKED_DEBUGGER_SETTINGS) {
        try {
            const config = vscode.workspace.getConfiguration(section);
            const tracked = config.get<string[]>(key, []);
            if (!tracked.includes(EMBEDDED_DEBUG_TYPE)) {
                await config.update(key, [...tracked, EMBEDDED_DEBUG_TYPE], vscode.ConfigurationTarget.Global);
                outputChannel.appendLine(`[Debug] Registered ${EMBEDDED_DEBUG_TYPE} in ${section}.${key}.`);
            }
        } catch (error) {
            outputChannel.appendLine(`[Debug] Failed to update ${section}.${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const missing: string[] = [];
    for (const extensionId of MCU_DEBUG_EXTENSION_IDS) {
        const extension = vscode.extensions.getExtension(extensionId);
        if (!extension) {
            missing.push(extensionId);
            continue;
        }
        if (!extension.isActive) {
            try {
                await extension.activate();
            } catch (error) {
                outputChannel.appendLine(`[Debug] Failed to activate ${extensionId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    if (missing.length > 0) {
        outputChannel.appendLine(`[Debug] Companion extensions not installed: ${missing.join(', ')}`);
    }
}

function createCoreExtensionContext(context: vscode.ExtensionContext, coreRoot: string): vscode.ExtensionContext {
    const coreUri = vscode.Uri.file(coreRoot);
    return new Proxy(context, {
        get(target, property) {
            if (property === 'extensionPath') { return coreRoot; }
            if (property === 'extensionUri') { return coreUri; }
            if (property === 'asAbsolutePath') {
                return (relativePath: string) => path.join(coreRoot, relativePath);
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}
