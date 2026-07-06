# Project: StreamDeck-Meet Audit & Quality Improvement

## Architecture
StreamDeck-Meet is a Google Chrome Extension content script designed to interface Google Meet with Elgato StreamDeck devices using the browser's WebHID API.
- **Entry point**: `src/main.js` instantiates `StreamDeck` and `MeetWrapper`.
- **StreamDeck Driver**: `src/StreamDeck.js` handles WebHID communication, and delegates model-specific packet formatting to `StreamDeckMini.js`, `StreamDeckV1.js`, `StreamDeckV2.js`, and `StreamDeckXL.js`.
- **Meet Integration**: `src/MeetWrapper.js` queries Google Meet's DOM, uses MutationObservers to watch UI changes (mute state, raise hand, closed caption, etc.), maps buttons, draws canvas/SVGs/emojis, and reacts to key presses on the StreamDeck.
- **Helpers**: `src/CanvasToBMP.js` converts 2D Canvas contexts to BMP format needed by StreamDeck.

## Code Layout
- `src/`: Core extension files (content scripts, manifest, SVG icons).
- `.agents/orchestrator/`: Project Orchestrator workspace.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Codebase Analysis | Run linter, analyze imports, document linter/quality issues | None | DONE |
| 2 | Build & Test Infrastructure Setup | Set up Jest, mock WebHID, Chrome Ext, and DOM APIs | M1 | DONE |
| 3 | Lint Error Resolution | Fix all ESLint errors | M1, M2 | DONE |
| 4 | Code Quality Audits & Refactoring | Fix bugs, race conditions, cleanup, formatting | M2, M3 | DONE |
| 5 | E2E and Integration Testing | Implement mocks and integration tests for full logic coverage | M2, M4 | DONE |
| 6 | Final Hardening & Audit Verification | Perform final audit, verify clean run, write audit_report.md | M5 | DONE |
| 7 | Resilient DOM Selectors | Implement fallbacks for Google Meet control elements | M6 | DONE |
| 8 | Options Page & Storage Implementation | Create and register options page using chrome.storage.local | M6 | DONE |
| 9 | StreamDeck Custom Mappings | Load custom key layouts in StreamDeck classes from storage | M8 | DONE |
| 10| E2E Integration and Test Verification | Add Jest tests for selectors/storage, verify lint and tests | M7, M9 | DONE |

## Interface Contracts
- `StreamDeck` interacts with browser `navigator.hid`.
- `MeetWrapper` interacts with `StreamDeck` methods: `connect()`, `isConnected`, `buttonNameToId()`, `fillURL()`, `fillCanvas()`, `clearAllButtons()`.
- `MeetWrapper` watches standard Google Meet DOM structures (e.g. selectors for mic, cam, cc, reactions buttons).
