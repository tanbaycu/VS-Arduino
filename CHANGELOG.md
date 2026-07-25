# Changelog

All notable changes to the **VS Arduino** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
