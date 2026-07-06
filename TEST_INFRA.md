# Test Infrastructure - StreamDeck-Meet

This document details the testing architecture, runner setup, and mock strategy for StreamDeck-Meet.

## Test Runner Setup
- **Runner**: Jest (v30+)
- **Environment**: `jsdom` (simulates browser environment in Node.js)
- **Babel Integration**: Used to transpile modern JavaScript classes and private class fields (`@babel/plugin-proposal-class-properties`, `@babel/plugin-proposal-private-methods`).

## Mock Architecture
1. **WebHID API (`navigator.hid`)**:
   - Simulated standard Chrome WebHID interface: `getDevices`, `requestDevice`, `addEventListener`, `removeEventListener`.
   - Simulates device dispatching of `connect`, `disconnect`, and `inputreport` (key down/up) events.
2. **Chrome Extension APIs (`chrome.runtime`)**:
   - Mocks `chrome.runtime.getURL` to return local paths for SVG icons, e.g. `chrome-extension://dummy-id/ico-svg/mic.svg`.
3. **DOM & MutationObservers**:
   - Google Meet uses complex dynamic DOM rendering. Tests construct target DOM fragments representing Lobby, Green Room, Meeting Room, and Exit Hall.
   - JSDOM's `MutationObserver` triggers the wrapper's reactive UI updates (e.g. mic mute/unmute, CC, raise hand).
4. **Canvas and Graphics (`OffscreenCanvas`, `Image`)**:
   - `OffscreenCanvas` is stubbed to mock 2D context drawing operations and image-to-blob conversions.
   - `Image` is stubbed to simulate instant load completion of resource URLs.
5. **Fullscreen APIs**:
   - `document.body.requestFullscreen`, `document.exitFullscreen`, and `document.fullscreenElement` are stubbed on the global DOM objects to verify full-screen toggle logic.

## Identified Features & Planned Coverage Metrics
1. **Connection & Discovery**:
   - Detects WebHID support.
   - Detects and filters supported devices (StreamDeck Mini, V1, V2, XL).
   - Handles connection state change notifications.
2. **Room Navigation**:
   - Detection of Lobby room (`/` or `/landing`).
   - MutationObserver-based room transitions: Green Room (`[jscontroller=dyDNGc]`), Meeting Room (`div[data-meeting-title]`), Exit Hall (`[jsname=r4nke]`).
3. **Green Room Controls**:
   - Mic/Cam toggle state representation.
   - Enter meeting action triggers button click.
4. **Meeting Room Controls**:
   - Toggle buttons: Mic, Camera, Closed Captions (CC), Raise Hand.
   - Sidebars/Panels: Info, People, Chat, Activities.
   - Presenting state updates.
   - End-call/hang up action.
5. **Reaction/Emoji Sub-Panel**:
   - Click Reaction button opens emoji mode.
   - Populates StreamDeck with actual emojis extracted from DOM.
   - Pressing emoji buttons on StreamDeck triggers clicks on corresponding DOM emojis.
   - Emoji panel closure detection (via polling/watching) exits emoji mode.
6. **Exit Hall Controls**:
   - Rejoin meeting.
   - Return to Home.

### Planned Coverage Metrics
- **Line Coverage**: Target >90% for `MeetWrapper.js` and `StreamDeck.js`.
- **Scenario Verification**: 100% of defined Tier 1-4 test scenarios must pass cleanly.
