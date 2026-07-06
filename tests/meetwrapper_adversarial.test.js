/* eslint-env jest, node */

const fs = require('fs');
const path = require('path');

// Setup global CanvasToBMP
const canvasToBmpPath = path.resolve(__dirname, '../src/CanvasToBMP.js');
const canvasToBmpCode = fs.readFileSync(canvasToBmpPath, 'utf8');
const CanvasToBMP = new Function('', canvasToBmpCode + '\nreturn CanvasToBMP;')();
global.CanvasToBMP = CanvasToBMP;

// Load StreamDeck subclasses
const loadClass = (filePath, className) => {
  const code = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
  return new Function('', code + `\nreturn ${className};`)();
};

global.StreamDeckMini = loadClass('../src/StreamDeckMini.js', 'StreamDeckMini');
global.StreamDeckV1 = loadClass('../src/StreamDeckV1.js', 'StreamDeckV1');
global.StreamDeckV2 = loadClass('../src/StreamDeckV2.js', 'StreamDeckV2');
global.StreamDeckXL = loadClass('../src/StreamDeckXL.js', 'StreamDeckXL');
global.StreamDeck = loadClass('../src/StreamDeck.js', 'StreamDeck');

// Load MeetWrapper
const wrapperPath = path.resolve(__dirname, '../src/MeetWrapper.js');
const wrapperCode = fs.readFileSync(wrapperPath, 'utf8');
const MeetWrapper = new Function('', wrapperCode + '\nreturn MeetWrapper;')();

describe('MeetWrapper & StreamDeck Adversarial Integration Tests', () => {
  let mockGet;
  let mockDevice;
  let streamDeck;
  let wrapper;
  let inputReportListener;
  let originalMutationObserver;
  let activeObservers;

  beforeEach(async () => {
    jest.useFakeTimers();

    // Mock MutationObserver to track and cleanly disconnect all observers
    originalMutationObserver = global.MutationObserver;
    activeObservers = [];
    global.MutationObserver = class MockMutationObserver {
      constructor(callback) {
        this.observer = new originalMutationObserver(callback);
        activeObservers.push(this.observer);
      }
      observe(target, options) {
        this.observer.observe(target, options);
      }
      disconnect() {
        this.observer.disconnect();
      }
      takeRecords() {
        return this.observer.takeRecords();
      }
    };

    mockGet = jest.fn();
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
        },
      },
      runtime: {
        getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
      },
    };

    // Mock navigator.userActivation
    Object.defineProperty(navigator, 'userActivation', {
      value: {isActive: true},
      writable: true,
      configurable: true,
    });

    inputReportListener = null;
    mockDevice = {
      opened: false,
      vendorId: 0x0fd9,
      productId: StreamDeckV2.PRODUCT_ID, // V2
      open: jest.fn().mockImplementation(function() {
        this.opened = true;
        return Promise.resolve(true);
      }),
      close: jest.fn().mockImplementation(function() {
        this.opened = false;
        return Promise.resolve(true);
      }),
      addEventListener: jest.fn((event, callback) => {
        if (event === 'inputreport') {
          inputReportListener = callback;
        }
      }),
      sendReport: jest.fn().mockResolvedValue(true),
      receiveFeatureReport: jest.fn().mockResolvedValue(new DataView(new ArrayBuffer(32))),
    };

    navigator.hid.getDevices = jest.fn().mockResolvedValue([mockDevice]);
    
    // Stub OffscreenCanvas & Image
    global.OffscreenCanvas = class {
      constructor() {}
      getContext() {
        return {
          fillStyle: '',
          fillRect: jest.fn(),
          translate: jest.fn(),
          scale: jest.fn(),
          rotate: jest.fn(),
          drawImage: jest.fn(),
          fillText: jest.fn(),
        };
      }
      convertToBlob() {
        return Promise.resolve({
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
        });
      }
    };

    streamDeck = new StreamDeck();
    
    // Change pathname using window.history to non-lobby so MutationObserver is registered
    window.history.pushState({}, '', '/meeting-xyz');
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    // Disconnect all mutation observers to prevent leaks/calls during teardown
    activeObservers.forEach((obs) => {
      try {
        obs.disconnect();
      } catch (e) {}
    });
    global.MutationObserver = originalMutationObserver;

    document.body.innerHTML = '';
    await Promise.resolve(); // Flush microtasks

    jest.clearAllTimers();
    jest.useRealTimers();
    jest.resetModules();
    delete global.chrome;
    delete global.OffscreenCanvas;
  });

  // Helper to simulate a button press on StreamDeck
  // buttonId is 0-indexed for V2 (from keyIndex 0 to 14)
  function simulateButtonPress(keyIndex, isPressed) {
    if (!inputReportListener) {
      throw new Error('No input report listener registered on mockDevice');
    }
    
    // Construct report buffer. V2 has OFFSET = 4.
    // The buffer size should be large enough to contain the keys.
    const buffer = new ArrayBuffer(32);
    const view = new Uint8Array(buffer);
    
    // set reportId = 1 (simulated by streamDeck listener)
    const event = {
      reportId: 0x01,
      data: {
        buffer: buffer,
      },
    };
    
    // V2 uses offset index 4. The keys array is at buffer indices [3 to 17]
    // keyIndex ranges from 0 to 14.
    // So target byte is 3 + keyIndex
    view[3 + keyIndex] = isPressed ? 1 : 0;
    
    inputReportListener(event);
  }

  describe('1. Overlapping/duplicated key mappings logic conflict', () => {
    test('should only execute the first matched action when multiple actions map to the same key index', async () => {
      // Custom mapping where mic and cam both map to key 10
      const overlappingMappings = {
        'mic': 10,
        'mic-disabled': 10,
        'cam': 10,
        'cam-disabled': 10,
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': overlappingMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      // Connect StreamDeck and load mappings
      await streamDeck.connect();
      
      // Verify button mappings are loaded correctly
      expect(streamDeck.buttonNameToId('mic')).toBe(10);
      expect(streamDeck.buttonNameToId('cam')).toBe(10);

      // Create MeetWrapper
      wrapper = new MeetWrapper(streamDeck);

      // Setup DOM elements for meeting room so wrapper enters meeting
      const meetingDiv = document.createElement('div');
      meetingDiv.setAttribute('data-meeting-title', 'My Meeting');
      document.body.appendChild(meetingDiv);

      const micBtn = document.createElement('button');
      micBtn.setAttribute('aria-label', 'Mute microphone');
      micBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(micBtn);

      const camBtn = document.createElement('button');
      camBtn.setAttribute('aria-label', 'Turn off camera');
      camBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(camBtn);

      // Trigger mutation observer to enter meeting
      await Promise.resolve(); // Allow promise microtasks to resolve

      micBtn.click = jest.fn();
      camBtn.click = jest.fn();

      // Simulate pressing button 10
      simulateButtonPress(10, true);

      // CHALLENGER OBSERVED FAILURE MODE:
      // Due to "else if" chain in MeetWrapper.#handleStreamDeckPress, pressing button 10 
      // will execute tapMic but skip tapCam!
      expect(micBtn.click).toHaveBeenCalledTimes(1);
      expect(camBtn.click).not.toHaveBeenCalled();
    });
  });

  describe('2. String key mapping type comparison failure', () => {
    test('should fail to execute action if button mapping is stored as string numeric', async () => {
      // Custom mapping where mic is stored as string '10' instead of number 10
      const stringMappings = {
        'mic': '10',
        'mic-disabled': '10',
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': stringMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      // Connect StreamDeck and load mappings
      await streamDeck.connect();
      
      // buttonNameToId returns '10' (string)
      expect(streamDeck.buttonNameToId('mic')).toBe('10');

      // Create MeetWrapper
      wrapper = new MeetWrapper(streamDeck);

      // Setup DOM elements for meeting room
      const meetingDiv = document.createElement('div');
      meetingDiv.setAttribute('data-meeting-title', 'My Meeting');
      document.body.appendChild(meetingDiv);

      const micBtn = document.createElement('button');
      micBtn.setAttribute('aria-label', 'Mute microphone');
      micBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(micBtn);

      await Promise.resolve(); // Allow promise microtasks to resolve

      micBtn.click = jest.fn();

      // Simulate pressing button 10
      simulateButtonPress(10, true);

      // CHALLENGER OBSERVED FAILURE MODE:
      // Due to strict equality checks (buttonId === buttonNameToId('mic')), 
      // 10 === '10' is false, so the action is completely ignored!
      expect(micBtn.click).not.toHaveBeenCalled();
    });
  });
});
