# Local Installation And Validation

This document describes how to install and validate the Career Navigator web Release Candidate locally.

## Validated Environment

- Node.js: `v24.16.0`
- npm: `11.13.0`
- OS used for validation: Windows with PowerShell
- Browsers validated automatically: Google Chrome through Playwright channel `chrome`, Microsoft Edge through `msedge`

Equivalent `npm` commands work on macOS/Linux. On Windows, examples use `npm.cmd` for reproducibility.

## Clone And Install

```powershell
git clone https://github.com/VictorAaguilar/career-navigator.git
cd career-navigator
git checkout feature/release-candidate-stabilization
npm.cmd ci
```

Do not use personal CVs or real offers for validation. The automated tests use synthetic data only.

## Run The Web App

Development server:

```powershell
npm.cmd run web:dev
```

Production build:

```powershell
npm.cmd run web:build
```

GitHub Pages production build:

```powershell
npm.cmd run web:build:pages
```

Preview production build:

```powershell
npm.cmd run preview --workspace @career-navigator/web -- --host 127.0.0.1 --port 4178
```

Stop Vite or Vite Preview with `Ctrl+C` in the terminal that started it.

## Validation Commands

Core validation:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run web:typecheck
npm.cmd run web:build
npm.cmd run web:bundle:check
npm.cmd run web:build:pages
npm.cmd run web:pages:artifact-check
npm.cmd audit --omit=dev
```

Browser validation with Chrome:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
npm.cmd run web:e2e
npm.cmd run web:e2e:import
npm.cmd run web:e2e:structure
npm.cmd run web:e2e:targeting
npm.cmd run web:e2e:rc
npm.cmd run web:e2e:pages
npm.cmd run web:e2e:rc:headed
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```

Full Release Candidate check after `npm.cmd ci`:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
npm.cmd run release:check
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```

`release:check` does not run `npm ci` and does not modify files intentionally. It stops at the first failing command.

## Browser Availability

If Chrome is not available, install or select a supported Playwright channel. Do not download browsers as part of the RC validation unless you are explicitly preparing the local machine.

Chromium full browser can be installed manually with:

```powershell
npx.cmd --no-install playwright install --no-shell chromium
```

The current E2E launcher supports:

- `chromium`
- `chrome`
- `msedge`

Example:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="msedge"
npm.cmd run web:e2e:rc
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```

Validation status for this RC environment:

- `chrome`: validated.
- `msedge`: validated.
- `chromium`: channel supported, but not available in this environment without manual browser installation.

## Ports

- Dev E2E: `5174`, `5177`
- Release Candidate preview E2E: `4178`
- GitHub Pages local preview E2E: `4179`

If a port is occupied, stop the existing Vite or Vite Preview process and rerun the command.

## Cleanup

After validation:

```powershell
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```

Generated folders are ignored by Git and should not be committed:

- `apps/web/dist`
- `test-results`
- `playwright-report`

The E2E runners create temporary downloads under the system temp directory and remove them on completion.

## Common Problems

`PLAYWRIGHT_BROWSER_NOT_AVAILABLE`:

- Chrome, Chromium or Edge is not available for Playwright.
- Install full Chromium with `npx.cmd --no-install playwright install --no-shell chromium`, or select installed Chrome/Edge.

`RC_PREVIEW_SERVER_NOT_READY`:

- `apps/web/dist` may not exist. Run `npm.cmd run web:build`.
- Port `4178` may be occupied.

Bundle budget failure:

- Do not raise budgets first.
- Check whether a heavy chunk became an initial asset.
- Confirm `pdf.worker`, PDF.js, JSZip and DOCX remain deferred.

GitHub Pages asset 404:

- Confirm `CAREER_NAVIGATOR_BASE_PATH=/career-navigator/`.
- Confirm `index.html` references `/career-navigator/assets/...`.
- Confirm `npm.cmd run web:pages:artifact-check` passes.
