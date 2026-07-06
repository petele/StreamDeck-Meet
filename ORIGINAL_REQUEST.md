# Original User Request

## Initial Request — 2026-06-13T15:36:06+02:00

You are the Project Orchestrator. Your mission is to coordinate the comprehensive audit of the StreamDeck-Meet codebase, resolve all linter errors, perform code quality audits & quality improvements (fixing bugs/race conditions, styling, cleanup), and produce the audit report as requested in ORIGINAL_REQUEST.md.
Your working directory is /Users/fraperez/Documents/StreamDeck-Meet.
You must:
1. Decompose the request into milestones and document your plan in `/Users/fraperez/Documents/StreamDeck-Meet/.agents/orchestrator/plan.md`.
2. Spawn specialist subagents to execute the steps. Do not write code directly.
3. Keep track of progress in `/Users/fraperez/Documents/StreamDeck-Meet/.agents/orchestrator/progress.md`.
4. Create the final `/Users/fraperez/Documents/StreamDeck-Meet/audit_report.md` file as required.
5. Report completion to me once all requirements and acceptance criteria are successfully met.
Let me know when you have initialized and written your plan.

## Follow-up — 2026-06-13T13:38:14Z

Yes, please proceed with executing Milestone 1: Exploration & Codebase Analysis.

## Follow-up — 2026-06-15T11:30:53Z

Implement robust DOM element selectors and a customizable key mapping configuration page for the StreamDeck-Meet extension.

Working directory: /Users/fraperez/Documents/StreamDeck-Meet
Integrity mode: development

## Requirements

### R1. Resilient DOM Selectors
Refactor the element selection methods in `src/MeetWrapper.js` (such as `#getMicButton()`, `#getCamButton()`, etc.) to:
- Use more robust selectors (e.g., matching by `aria-label`, tooltip contents, icon classes, or SVG path markers) as a fallback/alternative to the obfuscated `jscontroller` and `jsname` attributes.
- Ensure the extension remains functional even if some individual obfuscated attributes change.

### R2. Options Page & Custom Button Mappings
- Create a Chrome Extension options page (`src/options.html`, `src/options.js`) to allow users to custom-map meeting actions to StreamDeck key IDs.
- Register `"options_page": "options.html"` and `"storage"` permission in `src/manifest.json`.
- Implement options storage using `chrome.storage.local`.
- Update `StreamDeck` and subclasses to load user key mappings from `chrome.storage.local` upon connection, falling back to the hardcoded default mapping arrays if custom configurations are missing.

### R3. Comprehensive Tests
- Extend the Jest test suite to cover mock `chrome.storage.local` reads, layout customizing, and resilient selector fallback paths.
- Ensure all tests and linters pass.

## Acceptance Criteria

### Resilient Selectors
- [ ] Fallback selectors correctly match mic/camera/CC/hand buttons in mocks when `jscontroller` attributes are removed or modified.

### Options Page & Storage
- [ ] Option page files (`options.html`, `options.js`) are created and registered in `manifest.json`.
- [ ] Key mappings configured in mock `chrome.storage.local` are successfully parsed and applied by the StreamDeck subclasses at runtime.

### Clean Build & Tests
- [ ] Running `npm run lint` succeeds with zero errors and zero warnings.
- [ ] Running `npm test` runs all tests successfully, demonstrating full passing coverage of standard layout mapping, custom layout mapping, and fallback selector lookups.
