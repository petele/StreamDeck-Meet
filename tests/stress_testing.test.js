/* eslint-env jest, node */

const fs = require('fs');
const path = require('path');

// Setup global mocks for MeetWrapper dependency checking
global.StreamDeckV1 = { PRODUCT_ID: 0x0060 };
global.StreamDeckMini = { PRODUCT_ID: 0x0063 };
global.StreamDeckXL = { PRODUCT_ID: 0x006c };
global.StreamDeckV2 = { PRODUCT_ID: 0x006d };

// Mock canvas-related Web APIs that are missing in standard JSDOM
class MockOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      rotate: jest.fn(),
      fillText: jest.fn(),
    };
  }
}
global.OffscreenCanvas = MockOffscreenCanvas;

const wrapperPath = path.resolve(__dirname, '../src/MeetWrapper.js');
const wrapperCode = fs.readFileSync(wrapperPath, 'utf8');
const MeetWrapper = new Function('', wrapperCode + '\nreturn MeetWrapper;')();

describe('Adversarial Stress-Testing for Customizable Options & Mappings', () => {
  let mockGet;
  let mockSet;
  let domContentLoadedHandler;

  beforeEach(() => {
    mockGet = jest.fn();
    mockSet = jest.fn().mockResolvedValue();
    global.chrome = {
      runtime: {
        getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
      },
      storage: {
        local: {
          get: mockGet,
          set: mockSet,
        },
      },
    };

    // Load options HTML into JSDOM
    const htmlPath = path.resolve(__dirname, '../src/options.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');
    document.documentElement.innerHTML = htmlCode;

    // Mock navigator.userActivation
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: true },
      writable: true,
      configurable: true,
    });

    // Intercept DOMContentLoaded
    document.addEventListener = jest.fn((event, handler) => {
      if (event === 'DOMContentLoaded') {
        domContentLoadedHandler = handler;
      }
    });

    // Load options.js
    const jsPath = path.resolve(__dirname, '../src/options.js');
    const jsCode = fs.readFileSync(jsPath, 'utf8');
    new Function('', jsCode)();
  });

  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
    document.documentElement.innerHTML = '';
  });

  describe('1. Overlapping / Duplicated Key Mappings', () => {
    test('Options page renders multiple actions on the same key in the visual preview', async () => {
      // Setup storage to return duplicate mappings: mic and cam on key 10
      const duplicatedMappings = {
        'mic': 10,
        'mic-disabled': 10,
        'cam': 10,
        'cam-disabled': 10,
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': duplicatedMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      const previewGrid = document.getElementById('sd-preview-grid');
      const key10 = previewGrid.children[10];

      expect(key10.classList.contains('active')).toBe(true);
      // It should display both mic and cam action tags under key 10
      expect(key10.textContent).toContain('mic');
      expect(key10.textContent).toContain('cam');
    });

    test('MeetWrapper only executes the first matched action in the if-else chain when duplicate key is pressed', () => {
      // Set up custom mappings in the mock StreamDeck where mic and cam are both key 10
      const customMappings = {
        'mic': 10,
        'cam': 10,
      };

      let keydownHandler;
      const mockStreamDeck = {
        isConnected: true,
        addEventListener: jest.fn((event, handler) => {
          if (event === 'keydown') keydownHandler = handler;
        }),
        removeEventListener: jest.fn(),
        buttonNameToId: jest.fn((name) => customMappings[name]),
        fillURL: jest.fn(),
        clearAllButtons: jest.fn(),
      };

      // Set up DOM elements for mic and cam in MeetWrapper
      const micBtn = document.createElement('button');
      micBtn.setAttribute('data-is-muted', 'false');
      const micClick = jest.fn();
      micBtn.addEventListener('click', micClick);

      const camBtn = document.createElement('button');
      camBtn.setAttribute('data-is-muted', 'false');
      const camClick = jest.fn();
      camBtn.addEventListener('click', camClick);

      // Mock document.querySelector to return our buttons
      const originalQuerySelector = document.querySelector;
      document.querySelector = jest.fn((selector) => {
        if (selector.includes('eB6kvd')) {
          // Mic button controller container
          const container = document.createElement('div');
          container.appendChild(micBtn);
          return container;
        }
        if (selector.includes('bwqwSd')) {
          // Cam button controller container or element
          const container = document.createElement('div');
          container.appendChild(camBtn);
          return container;
        }
        return originalQuerySelector.call(document, selector);
      });

      // Force room state to meeting (MeetWrapper uses path to determine lobby vs meeting)
      // Pathname '/landing' or '/' is lobby. Let's make it something else.
      window.history.pushState({}, '', '/some-meeting-room');

      // Initialize MeetWrapper
      const wrapper = new MeetWrapper(mockStreamDeck);

      // Simulate entering meeting room by triggering a mutation or direct room entry
      // MeetWrapper has body observer that listens for meeting room indicators: div[data-meeting-title]
      const indicator = document.createElement('div');
      indicator.setAttribute('data-meeting-title', 'Test Meet');
      document.body.appendChild(indicator);

      // Trigger mutation observer (wait a bit or call handler)
      // Actually, since MutationObserver is async, let's trigger keypress after mutation runs,
      // or we can mock MutationObserver to be synchronous if needed, or wait.
      // But standard JSDOM has MutationObserver. Let's use a small timeout.
      return new Promise((resolve) => {
        setTimeout(() => {
          // Verify we registered the keydown handler
          expect(keydownHandler).toBeDefined();

          // Simulate button 10 pressed
          keydownHandler({
            detail: {
              buttonId: 10,
              pushed: true,
              buttonStates: []
            }
          });

          // Due to if-else logic in MeetWrapper.#handleStreamDeckPress:
          // it checks:
          // else if (buttonId === this.#streamDeck.buttonNameToId('mic')) { this.#tapMic(); }
          // else if (buttonId === this.#streamDeck.buttonNameToId('cam')) { this.#tapCam(); }
          //
          // Because buttonNameToId('mic') is 10, it matches first, clicks mic, and returns!
          // buttonNameToId('cam') is also 10, but that branch is never reached.
          expect(micClick).toHaveBeenCalledTimes(1);
          expect(camClick).toHaveBeenCalledTimes(0);

          resolve();
        }, 100);
      });
    });
  });

  describe('2. Out-of-Bounds & Invalid Key Indices', () => {
    test('Visual preview and Options Page handle negative indices gracefully (ignored on grid)', async () => {
      const negativeMappings = {
        'mic': -5,
        'mic-disabled': -5,
        'cam': -1,
        'cam-disabled': -1,
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': negativeMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      const previewGrid = document.getElementById('sd-preview-grid');
      // Verify no keys in the grid are marked active or contain mic
      for (let i = 0; i < previewGrid.children.length; i++) {
        expect(previewGrid.children[i].textContent).not.toContain('mic');
      }

      // Mic select should default to empty string "" because -5 is not a valid option in the DOM
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('');
    });

    test('Visual preview and Options Page handle out-of-bounds large indices gracefully', async () => {
      const oobMappings = {
        'mic': 99,
        'mic-disabled': 99,
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': oobMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      const previewGrid = document.getElementById('sd-preview-grid');
      for (let i = 0; i < previewGrid.children.length; i++) {
        expect(previewGrid.children[i].textContent).not.toContain('mic');
      }

      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe(''); // defaulted to empty since 99 doesn't exist
    });

    test('String representations of numbers are parsed incorrectly in visual preview and MeetWrapper due to strict equality (===)', async () => {
      const stringMappings = {
        'mic': '10', // String representation
        'mic-disabled': '10',
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': stringMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      const previewGrid = document.getElementById('sd-preview-grid');
      const key10 = previewGrid.children[10];
      // Since it uses `val === i` where `val` is "10" and `i` is 10, they are not strictly equal.
      // Therefore, the grid item won't be active.
      expect(key10.classList.contains('active')).toBe(false);
      expect(key10.textContent).not.toContain('mic');

      // Now verify in MeetWrapper:
      const mockStreamDeck = {
        isConnected: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        buttonNameToId: jest.fn((name) => stringMappings[name]), // returns "10"
        fillURL: jest.fn(),
        clearAllButtons: jest.fn(),
      };

      // Set up DOM elements for mic
      const micBtn = document.createElement('button');
      micBtn.setAttribute('data-is-muted', 'false');
      const micClick = jest.fn();
      micBtn.addEventListener('click', micClick);

      const originalQuerySelector = document.querySelector;
      document.querySelector = jest.fn((selector) => {
        if (selector.includes('eB6kvd')) {
          const container = document.createElement('div');
          container.appendChild(micBtn);
          return container;
        }
        return originalQuerySelector.call(document, selector);
      });

      window.history.pushState({}, '', '/some-meeting-room2');
      const wrapper = new MeetWrapper(mockStreamDeck);

      const indicator = document.createElement('div');
      indicator.setAttribute('data-meeting-title', 'Test Meet 2');
      document.body.appendChild(indicator);

      return new Promise((resolve) => {
        setTimeout(() => {
          // Trigger keypress on button 10 (number)
          const keydownListener = mockStreamDeck.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];
          keydownListener({
            detail: {
              buttonId: 10,
              pushed: true,
              buttonStates: []
            }
          });

          // In MeetWrapper, buttonId (10) === buttonNameToId('mic') ("10") is FALSE.
          // So the click is NOT triggered. This is a vulnerability/bug.
          expect(micClick).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
  });

  describe('3. Storage Failures & Corrupted Storage Data', () => {
    test('Options Page falls back to DEFAULTS cleanly when chrome.storage.local.get throws an error', async () => {
      mockGet.mockImplementation(() => {
        throw new Error('Storage permission denied or storage corrupted');
      });

      // Spy on console.error to check if it logs the error gracefully
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await domContentLoadedHandler();

      // Verify it fell back to default mic key for v2 (which is 10)
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('10');

      const previewGrid = document.getElementById('sd-preview-grid');
      const key10 = previewGrid.children[10];
      expect(key10.classList.contains('active')).toBe(true);
      expect(key10.textContent).toContain('mic');

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    test('Options Page falls back to DEFAULTS when storage returns undefined/null', async () => {
      mockGet.mockImplementation((key, callback) => {
        // Return null mappings object
        if (callback) callback(null);
        return Promise.resolve(null);
      });

      await domContentLoadedHandler();

      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('10'); // Fallback to default
    });

    test('Options Page handles completely corrupted non-object mapping value gracefully', async () => {
      mockGet.mockImplementation((key, callback) => {
        // Return completely invalid non-object mapping
        const res = { 'mappings_v2': 12345 };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      // Since currentMappings = { ...12345 } which resolves to {}, all mappings are undefined.
      // So all dropdowns should default to '-1' (Disabled).
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('-1');

      const previewGrid = document.getElementById('sd-preview-grid');
      for (let i = 0; i < previewGrid.children.length; i++) {
        expect(previewGrid.children[i].classList.contains('active')).toBe(false);
      }
    });
  });

  describe('4. Real-time DOM Interaction and Preview Updates', () => {
    test('Changing dropdown selection instantly updates visual preview grid', async () => {
      mockGet.mockImplementation((key, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      });

      await domContentLoadedHandler();

      const micSelect = document.getElementById('action-mic');
      const previewGrid = document.getElementById('sd-preview-grid');

      // Default mic is at key 10
      expect(previewGrid.children[10].textContent).toContain('mic');

      // Change selection to 3
      micSelect.value = '3';
      micSelect.dispatchEvent(new Event('change'));

      // Key 10 should no longer be active or contain mic
      expect(previewGrid.children[10].textContent).not.toContain('mic');
      // Key 3 should now be active and contain mic
      expect(previewGrid.children[3].classList.contains('active')).toBe(true);
      expect(previewGrid.children[3].textContent).toContain('mic');
    });

    test('Switching device model immediately updates key count and layouts', async () => {
      mockGet.mockImplementation((key, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      });

      await domContentLoadedHandler();

      const deviceModelSelect = document.getElementById('device-model');
      const previewGrid = document.getElementById('sd-preview-grid');

      // Default model is v2 (15 keys)
      expect(previewGrid.children.length).toBe(15);

      // Switch to mini (6 keys)
      deviceModelSelect.value = 'mini';
      deviceModelSelect.dispatchEvent(new Event('change'));

      // Wait for loadModelSettings promise to resolve
      await new Promise(process.nextTick);

      expect(previewGrid.children.length).toBe(6);

      // Switch to xl (32 keys)
      deviceModelSelect.value = 'xl';
      deviceModelSelect.dispatchEvent(new Event('change'));

      await new Promise(process.nextTick);

      expect(previewGrid.children.length).toBe(32);
    });
  });
});
