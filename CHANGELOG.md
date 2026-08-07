# Changelog

All notable changes to the **VS Arduino** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026.8.6]

### Added

- **Snippets.** Save and reuse code fragments across any sketch via three new commands: **`VS Arduino: Create Snippet`** (create or overwrite a named snippet — pre-fills the body from the current selection), **`VS Arduino: Insert Snippet`** (pick from a list and insert at the cursor with full VS Code snippet tab-stop support: `$1`, `${1:placeholder}`, etc.), and **`VS Arduino: Delete Snippet`**. Snippets are stored in global extension state and persist across sessions and workspaces. The keybinding `Ctrl+Shift+I` (when an editor has focus) triggers insert.
- **Custom `.ino` scaffold template.** The `vs-arduino.inoScaffoldTemplate` setting (multiline string) lets you replace the default `setup()`/`loop()` boilerplate with any starting code. Edit it directly in Settings UI (a textarea is shown) or in `settings.json`. Leave it empty to keep the default. The existing `vs-arduino.inoScaffolding` flag still acts as the on/off switch.

## [2026.8.5]

### Fixed

- **Hardware debugging works again on stock Arduino ARM boards.** The Cortex-Debug core shipped in 2026.8.4 (1.12.1) refuses to start when GDB's major version is below 9, and Arduino's official `arm-none-eabi-gcc 7-2017q4` toolchain — used by SAMD boards such as the Zero, MKR family, and Nano 33 IoT — bundles GDB 8.0.50. Every debug session on those boards failed with *"GDB major version should be >= 9"*. The embedded core is reverted to 1.12.1's predecessor, **1.5.1**, which only logs a deprecation warning on GDB 8 and keeps debugging.

### Changed

- The debugging views are provided by the embedded core again (**Cortex Peripherals**, **Cortex Registers**, **RTOS** panel, memory viewer, disassembly), so no companion extension is required. The **mcu-debug** extension dependencies introduced in 2026.8.4 are removed: they are only distributed alongside newer Cortex-Debug releases that mandate GDB 9+, and pinning the core to a version Arduino's toolchain can drive takes priority over the newer view implementations.
- `scripts/merge-cortex-manifest.js` drops `extensionDependencies` from the manifest when the core declares none, and no longer double-prefixes configuration section titles that already start with `Cortex-Debug`.

Everything added in 2026.8.4 that is unrelated to the debugger — the **Open Example Sketch** and **Run arduino-cli Command** commands, colored output, and the separate `VS Arduino: IntelliSense` channel — is unchanged.

## [2026.8.4]

### Added

- **`VS Arduino: Open Example Sketch`** command. Pick whether the example comes from a **Board Package** or a **Library**, choose the installed item, then browse its bundled sketches through the same nested picker used by the Board and Library managers.
- **`VS Arduino: Run arduino-cli Command`** command. Type any full command (for example `arduino-cli lib list`) in a picker that remembers your recent commands and suggests common ones. Output streams into `Output > VS Arduino` under a `[Command "..."]` header with the panel opened automatically, and when the CLI asks a question the answer is collected through a yes/no picker or an input box and written back to the process.
- **Colored output.** Both output channels use a dedicated syntax so `[Tag]` prefixes, errors, warnings, and success messages are highlighted. Every log line the extension writes now carries a tag such as `[Setup]`, `[Compile]`, `[Upload]`, `[Debug]`, `[Packages]`, or `[Command]`.
- **Separate `VS Arduino: IntelliSense` output channel.** IntelliSense analysis logs no longer interleave with build and upload output in the main `VS Arduino` channel.

### Changed

- **Embedded Cortex-Debug core upgraded from 1.5.1 to 1.12.1.** The old built-in debugging views (Cortex Peripherals, Cortex Registers, RTOS panel, legacy memory viewer) are replaced by the dedicated **mcu-debug** companion extensions, declared as extension dependencies and installed automatically from the Marketplace / Open VSX: `mcu-debug.debug-tracker-vscode`, `mcu-debug.memory-view`, `mcu-debug.rtos-views`, and `mcu-debug.peripheral-viewer`.
- New **Cortex Live Watch** view from the upgraded core, and CPU registers now appear as a scope in the Variables panel instead of a separate view.
- VS Arduino registers its debug type with the companion extensions on startup (`memory-view.trackDebuggers`, `mcu-debug.rtos-views.trackDebuggers`) and activates them automatically, so the Memory, RTOS, and Peripheral views work with the embedded debugger out of the box.
- Cortex-Debug settings are now grouped into the upstream sections (Debugger, GNU Tools, GDB Servers, Miscellaneous), and setting values under `cortex-debug.*` are honored by the embedded core (previously they were read from a mismatched section and silently ignored).
- IntelliSense configurations are now generated for sketches already present in the workspace at startup, instead of waiting until a `.ino` file is opened or saved.
- `scripts/merge-cortex-manifest.js` is now idempotent: it strips previously merged core contributions before re-merging, preserves the extension's own language and grammar contributions, and copies the core's extension dependencies into the host manifest.

### Removed

- The built-in RTOS bottom panel, Cortex Peripherals view, and Cortex Registers view, together with their commands and the `cortex-debug.showRTOS` setting — superseded by the mcu-debug extensions (`xRTOS` panel, `XPeripherals` view, MEMORY panel).
- The startup prompt offering to install the mcu-debug companion extensions. Missing companions are now only noted in the output channel; Visual Studio Code already installs extension dependencies when VS Arduino is installed from a store.
- Documentation-only assets from the embedded Cortex-Debug core (screenshots and the doc generator), trimming roughly 770 KB from the published package.

## [2026.8.2]

### Added

- **Instant IntelliSense for new sketches.** Board properties discovered during analysis are now cached per board in persistent storage, so creating a new `.ino` file immediately produces a complete `c_cpp_properties.json` with the compiler path, include paths, and defines for the selected board — no compilation wait, and no error squiggles while typing in a brand-new sketch that has not been saved yet.

### Changed

- The analysis sketch copy used to resolve local `"..."` headers is now created in the system temp directory instead of inside the sketch's `.vscode` folder, and is always removed after analysis. This stops the recursive `.vscode/<sketch>/.vscode/<sketch>/...` folder nesting that appeared when the copied sketch was opened.
- Sketch files located inside a `.vscode` folder are ignored by all IntelliSense triggers (open, save, edit, create), and leftover sketch copies from previous versions are cleaned up automatically on the next analysis.
- The CircleCI badge in the READMEs now uses a Marketplace-compatible shields.io image.

### Fixed

- **IntelliSense configuration now regenerates reliably.** Previously, pasting or writing code into a sketch could leave a stub configuration with an empty compiler path in place forever — even after deleting `.vscode` and reopening the file — because `arduino-cli` served fully cached builds whose verbose output contains no compiler command lines to parse. Every analysis compile now runs with a fresh `--build-path`, guaranteeing parseable output on every run.
- An incomplete or stub `c_cpp_properties.json` is now detected and regenerated even when the sketch's `#include` lines have not changed — sketches with no `#include` at all (plain `pinMode`/`digitalWrite` code) previously never triggered regeneration.
- Regeneration requests arriving while an analysis is already running are queued and executed afterwards instead of being dropped.
- The include cache is committed only after a configuration is successfully written, so a failed analysis no longer blocks future attempts.
- `arduino-cli` process launch failures are handled instead of leaving the analysis hanging, and partial results are still used when auxiliary probes fail.
- `#include<Header.h>` without a space after `#include` is now recognized.

## [2026.7.2301]

### Added

- **Example sketch browser** in the Board Manager and Library Manager. Right-click any entry under *Installed* and choose **Examples** from Visual Studio Code's native context menu to browse the package's bundled sketches. Nested example folders are navigated through a searchable picker with breadcrumbs and a **Back** entry.
- Selecting an example copies the sketch folder into your sketchbook before opening it, so the original files shipped with the library or board package are never modified. Duplicate names are resolved with a numeric suffix and the `.ino` file is renamed to match its folder.
- A notification asks whether to open the example in **This Window** or a **New Window**. After choosing, a follow-up dialog offers **Set as Default**, **No, Thanks**, or **Don't Ask Again**.
- **Update notifications** for installed board packages and libraries. A single outdated item is named with its version change; two or more are reported as counts only. Board and library updates are combined into one notification with **Update** and **No, Thanks** actions, plus **Don't Notify for This** for a single item or **Stop Update Notifications** when several are pending.
- New settings: `vs-arduino.exampleOpenTarget`, `vs-arduino.exampleOpenAskToSetDefault`, `vs-arduino.checkForUpdates`, and `vs-arduino.ignoredUpdates`.

### Changed

- The Board Manager and Library Manager search indicator is now a rounded-cap sliding bar in the Arduino teal used by the Verify and Upload actions.
- Source files across the extension and the UI sources are now comment-free, relying on self-documenting names instead.

### Fixed

- **Automatic `arduino-cli` download now works on every supported platform.** The previous implementation requested installer scripts from a branch path that returns HTTP 404 and never unpacked the archive. Releases are now resolved through the GitHub Releases API (falling back to `1.5.1` when the API is unreachable), the correct archive is selected for the detected platform and architecture, redirects no longer leave a locked partial file, and the archive is extracted natively with `Expand-Archive` on Windows or `tar` elsewhere. The binary is marked executable on Unix systems and its path is written to `vs-arduino.arduinoCliPath`. Thanks to the contributor who reported and fixed this.

## [2026.7.1802]

### Added

- Localized READMEs in Vietnamese, Japanese, and Chinese with a language switcher.
- Contributing guide and GitHub issue templates (Bug Report, Feature Request).

### Changed

- README expanded with Installation, Getting Started, Requirements, FAQ & Troubleshooting, and Credits sections.
- Open VSX releases now publish under the `HiTECH-Corporation` namespace, matching the VS Code Marketplace.

## [2026.7.1801]

### Fixed

- Slimmed the published package back to its intended contents; CI build caches are no longer bundled into the VSIX.
- Release pipeline now verifies package size and skips already-published versions instead of failing.

## [2026.7.1701]

### Added

- **Compile & Upload pipeline** driven by `arduino-cli`, with live build output streamed to the `Output > VS Arduino` channel and one-click toolbar actions for `.ino` files.
- **Control Panel** activity-bar view for selecting Board (FQBN), Port, and Programmer, with selections persisted across sessions.
- **Board Manager** with search, per-version selection, and Install / Update / Downgrade / Uninstall actions.
- **Library Manager** with the same version-aware action model as the Board Manager.
- **Serial Monitor** available as both a bottom panel and an editor tab, with pinned input row, timestamping, and configurable baud rate and line endings.
- **Serial Plotter** with five distinct chart types (Waveform, Multi-line, Sensor, Digital Pulse, Bit Stream), smooth/step/linear interpolation, zoom and pan, precise hover inspection, and CSV export in `Point, Series...` format.
- **Zero-config Hardware Debugging** via an embedded Cortex-Debug core — no companion extension required. Debug sessions resolve the toolchain, GDB server, and SVD file automatically and stop at the sketch's `setup()` function, skipping core static initializers.
- **Cortex debug views**: Peripherals, Registers, Memory viewer, Disassembly, and an optional RTOS panel.
- **Automatic IntelliSense** generation that regenerates C/C++ configurations whenever the sketch's `#include` set changes, without polluting the output channel.

### Changed

- Board Manager and Library Manager primary action now reads **Install** instead of **Download**.
- Package-management operations (install, update, downgrade, uninstall) surface their progress in `Output > VS Arduino`.

### Removed

- The separate Cortex-Debug VSIX installation flow — the debugger core now ships inside the extension.
