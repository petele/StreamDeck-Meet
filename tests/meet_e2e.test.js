/* eslint-env jest, node */
/* eslint-disable require-jsdoc */

const fs = require('fs');
const path = require('path');

// Setup global CanvasToBMP
const canvasToBmpPath = path.resolve(__dirname, '../src/CanvasToBMP.js');
const canvasToBmpCode = fs.readFileSync(canvasToBmpPath, 'utf8');
const CanvasToBMP = new Function(
    '', canvasToBmpCode + '\nreturn CanvasToBMP;')();
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
global.MeetWrapper = loadClass('../src/MeetWrapper.js', 'MeetWrapper');

describe('StreamDeck-Meet E2E and Integration Tests', () => {
  let mockDevice;
  let deviceListeners;
  let hidListeners;
  let mockHid;
  let imageInstances;
  let activeObservers;
  let OriginalMutationObserver;

  // Helper to generate V2 input report buffer
  const triggerV2KeyPress = (buttonId) => {
    // start offset is 3 (OFFSET - 1 for V2)
    const index = 3 + buttonId;
    const bufferData = new Array(19).fill(0);

    // Press key
    bufferData[index] = 1;
    mockDevice.triggerInputReport(0x01, bufferData);

    // Release key
    bufferData[index] = 0;
    mockDevice.triggerInputReport(0x01, bufferData);
  };

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Mock navigator.userActivation
    Object.defineProperty(navigator, 'userActivation', {
      value: {isActive: true},
      writable: true,
      configurable: true,
    });

    // Reset list of listeners
    deviceListeners = {};
    hidListeners = {};

    // Mock MutationObserver to collect all active observers
    activeObservers = [];
    OriginalMutationObserver = global.MutationObserver;
    global.MutationObserver = class {
      constructor(callback) {
        this.observer = new OriginalMutationObserver(callback);
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

    // Mock WebHID device
    mockDevice = {
      opened: false,
      vendorId: 0x0fd9,
      productId: global.StreamDeckV2.PRODUCT_ID,
      productName: 'Elgato Stream Deck V2',
      open: jest.fn().mockImplementation(() => {
        mockDevice.opened = true;
        return Promise.resolve(true);
      }),
      close: jest.fn().mockImplementation(() => {
        mockDevice.opened = false;
        return Promise.resolve(true);
      }),
      addEventListener: jest.fn((event, callback) => {
        deviceListeners[event] = deviceListeners[event] || [];
        deviceListeners[event].push(callback);
      }),
      removeEventListener: jest.fn((event, callback) => {
        if (deviceListeners[event]) {
          deviceListeners[event] = deviceListeners[event]
              .filter((cb) => cb !== callback);
        }
      }),
      sendReport: jest.fn().mockResolvedValue(true),
      receiveFeatureReport: jest.fn()
          .mockResolvedValue(new DataView(new ArrayBuffer(32))),
      sendFeatureReport: jest.fn().mockResolvedValue(true),
      triggerInputReport: (reportId, dataArray) => {
        const buffer = new Uint8Array(dataArray).buffer;
        const event = {
          reportId,
          data: {buffer},
        };
        if (deviceListeners['inputreport']) {
          deviceListeners['inputreport'].forEach((cb) => cb(event));
        }
      },
    };

    // Mock navigator.hid
    mockHid = {
      getDevices: jest.fn().mockResolvedValue([mockDevice]),
      requestDevice: jest.fn().mockResolvedValue([mockDevice]),
      addEventListener: jest.fn((event, callback) => {
        hidListeners[event] = hidListeners[event] || [];
        hidListeners[event].push(callback);
      }),
      removeEventListener: jest.fn((event, callback) => {
        if (hidListeners[event]) {
          hidListeners[event] = hidListeners[event]
              .filter((cb) => cb !== callback);
        }
      }),
      triggerConnect: (device) => {
        if (hidListeners['connect']) {
          hidListeners['connect']
              .forEach((cb) => cb({type: 'connect', device}));
        }
      },
      triggerDisconnect: (device) => {
        if (hidListeners['disconnect']) {
          hidListeners['disconnect']
              .forEach((cb) => cb({type: 'disconnect', device}));
        }
      },
    };

    Object.defineProperty(navigator, 'hid', {
      value: mockHid,
      writable: true,
      configurable: true,
    });

    // Mock OffscreenCanvas
    global.OffscreenCanvas = class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return {
          fillStyle: '',
          fillRect: jest.fn(),
          translate: jest.fn(),
          scale: jest.fn(),
          rotate: jest.fn(),
          drawImage: jest.fn(),
          font: '',
          textAlign: '',
          textBaseline: '',
          fillText: jest.fn(),
        };
      }
      convertToBlob() {
        return Promise.resolve({
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
        });
      }
    };

    // Mock Image
    imageInstances = [];
    global.Image = class {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
        this.width = 72;
        this.height = 72;
        imageInstances.push(this);
      }
    };

    // Mock Fullscreen APIs
    document.body.requestFullscreen = jest.fn().mockResolvedValue(undefined);
    document.exitFullscreen = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    activeObservers.forEach((obs) => {
      try {
        obs.disconnect();
      } catch (e) {
        // ignore
      }
    });
    global.MutationObserver = OriginalMutationObserver;
    jest.useRealTimers();
  });

  describe('Tier 1: Feature Coverage (Happy Paths)', () => {
    test('wrapper connects and registers event listeners', async () => {
      window.history.pushState({}, '', '/');
      const streamDeck = new global.StreamDeck();
      const connected = await streamDeck.connect();
      expect(connected).toBe(true);

      const wrapper = new global.MeetWrapper(streamDeck);
      expect(wrapper).toBeDefined();
      expect(streamDeck.isConnected).toBe(true);
    });

    test('UI draws buttons appropriately on connection', async () => {
      window.history.pushState({}, '', '/');
      const streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      const fillURLSpy = jest.spyOn(streamDeck, 'fillURL');

      new global.MeetWrapper(streamDeck);

      expect(fillURLSpy).toHaveBeenCalled();
      const urls = fillURLSpy.mock.calls.map((c) => c[1]);
      expect(urls.some((u) => u.includes('fullscreen-off'))).toBe(true);
      expect(urls.some((u) => u.includes('start-next'))).toBe(true);
      expect(urls.some((u) => u.includes('start-instant'))).toBe(true);
    });

    test('UI draws lobby buttons appropriately when pathname is /home', async () => {
      window.history.pushState({}, '', '/home');
      const streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      const fillURLSpy = jest.spyOn(streamDeck, 'fillURL');

      new global.MeetWrapper(streamDeck);

      expect(fillURLSpy).toHaveBeenCalled();
      const urls = fillURLSpy.mock.calls.map((c) => c[1]);
      expect(urls.some((u) => u.includes('fullscreen-off'))).toBe(true);
      expect(urls.some((u) => u.includes('start-next'))).toBe(true);
      expect(urls.some((u) => u.includes('start-instant'))).toBe(true);
    });

    test(
        'main.js setup: clicking connection button triggers startup',
        async () => {
          window.history.pushState({}, '', '/');
          const mainPath = path.resolve(__dirname, '../src/main.js');
          const mainCode = fs.readFileSync(mainPath, 'utf8');
          const codeWithoutGo = mainCode
              .replace(/go\(\);?\s*$/, '');

          const mainContext = new Function(
              'StreamDeck', 'MeetWrapper', 'document', 'window',
              'navigator', 'chrome',
              codeWithoutGo +
              '\nreturn { go, startWrapper, sdConnectButtonID };',
          );

          const contextObj = mainContext(
              global.StreamDeck, global.MeetWrapper,
              document, window, navigator, global.chrome,
          );

          mockHid.getDevices.mockResolvedValueOnce([]);

          await contextObj.go();

          const btn = document.getElementById(contextObj.sdConnectButtonID);
          expect(btn).toBeDefined();
          expect(btn.textContent.trim()).toBe('Connect StreamDeck');

          mockHid.getDevices.mockResolvedValue([mockDevice]);

          btn.click();
          await new Promise(process.nextTick);

          expect(document.getElementById(
              contextObj.sdConnectButtonID)).toBeNull();
        });

    test(
        'main.js setup: connection button is also displayed when on a meeting page /abc-defg-hij',
        async () => {
          window.history.pushState({}, '', '/abc-defg-hij');
          const mainPath = path.resolve(__dirname, '../src/main.js');
          const mainCode = fs.readFileSync(mainPath, 'utf8');
          const codeWithoutGo = mainCode
              .replace(/go\(\);?\s*$/, '');

          const mainContext = new Function(
              'StreamDeck', 'MeetWrapper', 'document', 'window',
              'navigator', 'chrome',
              codeWithoutGo +
              '\nreturn { go, startWrapper, sdConnectButtonID };',
          );

          const contextObj = mainContext(
              global.StreamDeck, global.MeetWrapper,
              document, window, navigator, global.chrome,
          );

          mockHid.getDevices.mockResolvedValueOnce([]);

          await contextObj.go();

          const btn = document.getElementById(contextObj.sdConnectButtonID);
          expect(btn).not.toBeNull();
          expect(btn.textContent.trim()).toBe('Connect StreamDeck');
        });

    test(
        'StreamDeck button press clicks correct DOM element (Mic toggle)',
        async () => {
          // Must not be '/' or '/landing' to register bodyObserver
          window.history.pushState({}, '', '/abc-defg-hij');

          const streamDeck = new global.StreamDeck();
          await streamDeck.connect();
          new global.MeetWrapper(streamDeck);

          // Simulate entering Meeting Room
          const meetingDiv = document.createElement('div');
          meetingDiv.setAttribute('data-meeting-title', 'My Meeting');
          document.body.appendChild(meetingDiv);

          const micCtrl = document.createElement('div');
          micCtrl.setAttribute('jscontroller', 'eB6kvd');
          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.click = jest.fn();
          micCtrl.appendChild(micBtn);
          document.body.appendChild(micCtrl);

          // Trigger mutation observer
          await new Promise(process.nextTick);

          const micButtonId = streamDeck.buttonNameToId('mic'); // 10
          expect(micButtonId).toBe(10);

          // Trigger Mic key press
          triggerV2KeyPress(micButtonId);

          expect(micBtn.click).toHaveBeenCalled();
        });
  });

  describe('Tier 2: Boundary & Corner Cases', () => {
    test('missing DOM elements during load (retry logic works)', async () => {
      jest.useFakeTimers();
      window.history.pushState({}, '', '/abc-defg-hij');

      const streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      new global.MeetWrapper(streamDeck);

      // Transition to Green Room
      const grDiv = document.createElement('div');
      grDiv.setAttribute('jscontroller', 'dyDNGc');
      document.body.appendChild(grDiv);

      // Let MutationObserver trigger
      await Promise.resolve();

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Advance timers by 5.1s to exceed 50 retry attempts
      jest.advanceTimersByTime(5100);

      expect(warnSpy).toHaveBeenCalledWith(
          '*SD-Meet*',
          expect.stringContaining(
              'Failed to find elements for room greenRoom',
          ),
      );
      warnSpy.mockRestore();
    });

    test('WebHID connections of unsupported devices are filtered', async () => {
      window.history.pushState({}, '', '/');
      const streamDeck = new global.StreamDeck();
      const filterSpy = jest.spyOn(streamDeck, 'connect');

      const unsupportedDevice = {
        vendorId: 0x9999,
        productId: 0x9999,
      };

      mockHid.triggerConnect(unsupportedDevice);

      expect(filterSpy).not.toHaveBeenCalled();
    });

    test(
        'loadImageFromURL rejection handles loading failures gracefully',
        async () => {
          window.history.pushState({}, '', '/');
          const streamDeck = new global.StreamDeck();
          await streamDeck.connect();

          const fillPromise = streamDeck.fillURL(1, 'http://failing-image.png');

          expect(imageInstances.length).toBe(1);
          // Trigger error (the code registers it as img.error)
          imageInstances[0].error(new Error('Load Failed'));

          await expect(fillPromise).rejects.toThrow('Load Failed');
        });

    test('calling connection functions when already connected', async () => {
      window.history.pushState({}, '', '/');
      const streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      expect(streamDeck.isConnected).toBe(true);

      const connectAgain = await streamDeck.connect();
      expect(connectAgain).toBe(true);
    });
  });

  describe('Tier 3: Cross-Feature / Interaction', () => {
    test(
        'room transitions when emoji panel is open clears emoji mode',
        async () => {
          window.history.pushState({}, '', '/abc-defg-hij');
          const streamDeck = new global.StreamDeck();
          await streamDeck.connect();
          new global.MeetWrapper(streamDeck);

          // Transition to meeting
          const meetingDiv = document.createElement('div');
          meetingDiv.setAttribute('data-meeting-title', 'Meeting');
          document.body.appendChild(meetingDiv);

          const rxCtrl = document.createElement('div');
          rxCtrl.setAttribute('jscontroller', 'M3NJxf');
          const rxBtn = document.createElement('button');
          rxBtn.setAttribute('aria-pressed', 'false');
          rxBtn.click = jest.fn(() => {
            rxBtn.setAttribute('aria-pressed', 'true');
          });
          rxCtrl.appendChild(rxBtn);
          document.body.appendChild(rxCtrl);

          const rxBar = document.createElement('div');
          rxBar.setAttribute('jscontroller', 'tdX73b');
          document.body.appendChild(rxBar);

          await new Promise(process.nextTick);

          // Open reaction panel
          const reactionBtnId = streamDeck.buttonNameToId('reaction'); // 0
          triggerV2KeyPress(reactionBtnId);

          const fillURLSpy = jest.spyOn(streamDeck, 'fillURL');

          // Transition to exit hall (remove meeting div, add rejoin div)
          document.body.removeChild(meetingDiv);
          const exitDiv = document.createElement('div');
          exitDiv.setAttribute('jsname', 'r4nke');
          document.body.appendChild(exitDiv);

          // Trigger mutation observer
          await new Promise(process.nextTick);

          // Simulate WebHID reconnect to trigger redraw of current room
          mockHid.triggerConnect(mockDevice);

          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('rejoin'))).toBe(true);
          expect(urls.some((u) => u.includes('home'))).toBe(true);
        });

    test('fast consecutive button toggles do not conflict', async () => {
      window.history.pushState({}, '', '/abc-defg-hij');
      const streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      new global.MeetWrapper(streamDeck);

      const meetingDiv = document.createElement('div');
      meetingDiv.setAttribute('data-meeting-title', 'Meeting');
      document.body.appendChild(meetingDiv);

      const micCtrl = document.createElement('div');
      micCtrl.setAttribute('jscontroller', 'eB6kvd');
      const micBtn = document.createElement('button');
      micBtn.setAttribute('data-is-muted', 'false');
      micBtn.click = jest.fn();
      micCtrl.appendChild(micBtn);
      document.body.appendChild(micCtrl);

      await new Promise(process.nextTick);

      const micButtonId = streamDeck.buttonNameToId('mic');

      // Trigger multiple fast consecutive pushes
      triggerV2KeyPress(micButtonId);
      triggerV2KeyPress(micButtonId);
      triggerV2KeyPress(micButtonId);

      expect(micBtn.click).toHaveBeenCalledTimes(3);
    });
  });

  describe('Tier 4: Real-World Workflow Scenarios', () => {
    test('complete meeting life cycle flow', async () => {
      // 1. Connection in Lobby
      window.history.pushState({}, '', '/');
      const streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      new global.MeetWrapper(streamDeck);

      // Lobby elements
      const instantBtn = document.createElement('button');
      instantBtn.setAttribute('jsname', 'CuSyi');
      instantBtn.click = jest.fn();
      document.body.appendChild(instantBtn);

      const instantBtnId = streamDeck.buttonNameToId('start-instant'); // 6
      triggerV2KeyPress(instantBtnId);

      expect(instantBtn.click).toHaveBeenCalled();

      // 2. Transition to Meeting Room (Simulate page navigation/reload)
      document.body.innerHTML = '';
      window.history.pushState({}, '', '/abc-def-ghi');
      new global.MeetWrapper(streamDeck);

      const meetingDiv = document.createElement('div');
      meetingDiv.setAttribute('data-meeting-title', 'My Meeting');
      document.body.appendChild(meetingDiv);

      const micCtrl = document.createElement('div');
      micCtrl.setAttribute('jscontroller', 'eB6kvd');
      const micBtn = document.createElement('button');
      micBtn.setAttribute('data-is-muted', 'false');
      micBtn.click = jest.fn();
      micCtrl.appendChild(micBtn);
      document.body.appendChild(micCtrl);

      const camCtrl = document.createElement('div');
      camCtrl.setAttribute('jscontroller', 'bwqwSd');
      const camBtn = document.createElement('button');
      camBtn.setAttribute('data-is-muted', 'false');
      camBtn.click = jest.fn();
      camCtrl.appendChild(camBtn);
      document.body.appendChild(camCtrl);

      const rxCtrl = document.createElement('div');
      rxCtrl.setAttribute('jscontroller', 'M3NJxf');
      const rxBtn = document.createElement('button');
      rxBtn.setAttribute('aria-pressed', 'false');
      rxBtn.click = jest.fn(() => {
        rxBtn.setAttribute('aria-pressed', 'true');
      });
      rxCtrl.appendChild(rxBtn);
      document.body.appendChild(rxCtrl);

      const rxBar = document.createElement('div');
      rxBar.setAttribute('jscontroller', 'tdX73b');
      const emojiBtn = document.createElement('button');
      emojiBtn.setAttribute('aria-label', 'Sparkle');
      emojiBtn.setAttribute('data-emoji', '✨');
      emojiBtn.click = jest.fn();
      rxBar.appendChild(emojiBtn);
      document.body.appendChild(rxBar);

      // Trigger mutation observer for meeting entrance
      await new Promise(process.nextTick);

      // Toggle Mic
      const micBtnId = streamDeck.buttonNameToId('mic');
      triggerV2KeyPress(micBtnId);
      expect(micBtn.click).toHaveBeenCalled();

      // Open Reaction Panel
      const reactionBtnId = streamDeck.buttonNameToId('reaction');
      triggerV2KeyPress(reactionBtnId);
      expect(rxBtn.click).toHaveBeenCalled();

      // Wait for emoji panel to open
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Press emoji key. Since reactionId = 0, first emoji
      // 'Sparkle' maps to key 1
      triggerV2KeyPress(1);
      expect(emojiBtn.click).toHaveBeenCalled();

      // Close Reaction Panel
      triggerV2KeyPress(reactionBtnId);
      await new Promise(process.nextTick);

      // 3. Hang up
      const hangupCtrl = document.createElement('div');
      hangupCtrl.setAttribute('jscontroller', 'm1IMT');
      const hangupBtn = document.createElement('button');
      hangupBtn.click = jest.fn(() => {
        // Transition DOM to Exit Hall (client-side transition)
        document.body.innerHTML = '';
        const exitDiv = document.createElement('div');
        exitDiv.setAttribute('jsname', 'r4nke');
        document.body.appendChild(exitDiv);
      });
      hangupCtrl.appendChild(hangupBtn);
      document.body.appendChild(hangupCtrl);

      await new Promise(process.nextTick);

      const hangupBtnId = streamDeck.buttonNameToId('end-call'); // 14
      triggerV2KeyPress(hangupBtnId);
      expect(hangupBtn.click).toHaveBeenCalled();

      // Trigger mutation observer for exit hall entrance
      await new Promise(process.nextTick);

      // 4. Exit Hall: click Rejoin
      const rejoinDiv = document.createElement('div');
      rejoinDiv.setAttribute('jsname', 'oI7Fj');
      const rejoinBtn = document.createElement('button');
      rejoinBtn.click = jest.fn();
      rejoinDiv.appendChild(rejoinBtn);
      document.body.appendChild(rejoinDiv);

      await new Promise(process.nextTick);

      const rejoinBtnId = streamDeck.buttonNameToId('rejoin'); // 10
      triggerV2KeyPress(rejoinBtnId);
      expect(rejoinBtn.click).toHaveBeenCalled();
    });
  });

  describe('Tier 5: Resilient Selectors & Fallback Strategy', () => {
    let streamDeck;
    let fillURLSpy;

    beforeEach(async () => {
      window.history.pushState({}, '', '/abc-defg-hij');
      streamDeck = new global.StreamDeck();
      await streamDeck.connect();
      fillURLSpy = jest.spyOn(streamDeck, 'fillURL');
      new global.MeetWrapper(streamDeck);

      // Simulate entering Meeting Room
      const meetingDiv = document.createElement('div');
      meetingDiv.setAttribute('data-meeting-title', 'My Resilient Meeting');
      document.body.appendChild(meetingDiv);

      // Add dummy hangup button to satisfy room-readiness checks in
      // enterMeeting
      const hangupBtn = document.createElement('button');
      hangupBtn.setAttribute('aria-label', 'leave call');
      document.body.appendChild(hangupBtn);
    });

    test(
        'Mic button fallback via SVG path matches, observes state, and clicks',
        async () => {
          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.click = jest.fn();

          const svg = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'svg',
          );
          const path = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'path',
          );
          path.setAttribute('d', 'M12 14c1.66 0 ...');
          svg.appendChild(path);
          micBtn.appendChild(svg);
          document.body.appendChild(micBtn);

          // Wait for retrySetup to complete and attach observers
          await new Promise((resolve) => setTimeout(resolve, 150));

          // 1. Verify click triggers correctly
          const micButtonId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micButtonId);
          expect(micBtn.click).toHaveBeenCalled();

          // 2. Verify state observation updates StreamDeck icon
          fillURLSpy.mockClear();
          micBtn.setAttribute('data-is-muted', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('mic-disabled'))).toBe(true);
        },
    );

    test(
        'Mic button fallback via Aria label matches and triggers click',
        async () => {
          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.setAttribute('aria-label', 'Mute microphone');
          micBtn.click = jest.fn();
          document.body.appendChild(micBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const micButtonId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micButtonId);
          expect(micBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          micBtn.setAttribute('data-is-muted', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('mic-disabled'))).toBe(true);
        },
    );

    test(
        'Cam button fallback via SVG path matches, observes state, and clicks',
        async () => {
          const camBtn = document.createElement('button');
          camBtn.setAttribute('data-is-muted', 'false');
          camBtn.click = jest.fn();

          const svg = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'svg',
          );
          const path = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'path',
          );
          path.setAttribute('d', 'M18 10.48c0 ...');
          svg.appendChild(path);
          camBtn.appendChild(svg);
          document.body.appendChild(camBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const camButtonId = streamDeck.buttonNameToId('cam');
          triggerV2KeyPress(camButtonId);
          expect(camBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          camBtn.setAttribute('data-is-muted', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('cam-disabled'))).toBe(true);
        },
    );

    test(
        'Cam button fallback via Aria label matches and triggers click',
        async () => {
          const camBtn = document.createElement('button');
          camBtn.setAttribute('data-is-muted', 'false');
          camBtn.setAttribute('aria-label', 'Turn off camera');
          camBtn.click = jest.fn();
          document.body.appendChild(camBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const camButtonId = streamDeck.buttonNameToId('cam');
          triggerV2KeyPress(camButtonId);
          expect(camBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          camBtn.setAttribute('data-is-muted', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('cam-disabled'))).toBe(true);
        },
    );

    test(
        'CC button fallback via SVG path matches, observes state, and clicks',
        async () => {
          const ccBtn = document.createElement('button');
          ccBtn.setAttribute('aria-pressed', 'false');
          ccBtn.click = jest.fn();

          const svg = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'svg',
          );
          const path = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'path',
          );
          path.setAttribute('d', 'M19.5 5.5c0 ...');
          svg.appendChild(path);
          ccBtn.appendChild(svg);
          document.body.appendChild(ccBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const ccButtonId = streamDeck.buttonNameToId('cc');
          triggerV2KeyPress(ccButtonId);
          expect(ccBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          ccBtn.setAttribute('aria-pressed', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('cc-on'))).toBe(true);
        },
    );

    test(
        'CC button fallback via Aria label matches and triggers click',
        async () => {
          const ccBtn = document.createElement('button');
          ccBtn.setAttribute('aria-pressed', 'false');
          ccBtn.setAttribute('aria-label', 'Turn on captions');
          ccBtn.click = jest.fn();
          document.body.appendChild(ccBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const ccButtonId = streamDeck.buttonNameToId('cc');
          triggerV2KeyPress(ccButtonId);
          expect(ccBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          ccBtn.setAttribute('aria-pressed', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('cc-on'))).toBe(true);
        },
    );

    test(
        'Hand button fallback via SVG path matches, observes state, and clicks',
        async () => {
          const handBtn = document.createElement('button');
          handBtn.setAttribute('aria-pressed', 'false');
          handBtn.click = jest.fn();

          const svg = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'svg',
          );
          const path = document.createElementNS(
              `http://www.w3.org/2000/svg`,
              'path',
          );
          path.setAttribute('d', 'M18 24c0 ...');
          svg.appendChild(path);
          handBtn.appendChild(svg);
          document.body.appendChild(handBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const handButtonId = streamDeck.buttonNameToId('hand');
          triggerV2KeyPress(handButtonId);
          expect(handBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          handBtn.setAttribute('aria-pressed', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('hand-raised'))).toBe(true);
        },
    );

    test(
        'Hand button fallback via Aria label matches and triggers click',
        async () => {
          const handBtn = document.createElement('button');
          handBtn.setAttribute('aria-pressed', 'false');
          handBtn.setAttribute('aria-label', 'Raise hand');
          handBtn.click = jest.fn();
          document.body.appendChild(handBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const handButtonId = streamDeck.buttonNameToId('hand');
          triggerV2KeyPress(handButtonId);
          expect(handBtn.click).toHaveBeenCalled();

          fillURLSpy.mockClear();
          handBtn.setAttribute('aria-pressed', 'true');
          await new Promise(process.nextTick);
          expect(fillURLSpy).toHaveBeenCalled();
          const urls = fillURLSpy.mock.calls.map((c) => c[1]);
          expect(urls.some((u) => u.includes('hand-raised'))).toBe(true);
        },
    );
  });
});

