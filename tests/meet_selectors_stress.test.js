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

describe('MeetWrapper Selector Stress and False Positive Tests', () => {
  let mockDevice;
  let deviceListeners;
  let mockHid;
  let activeObservers;
  let OriginalMutationObserver;

  const triggerV2KeyPress = (buttonId) => {
    const index = 3 + buttonId;
    const bufferData = new Array(19).fill(0);
    bufferData[index] = 1;
    mockDevice.triggerInputReport(0x01, bufferData);
    bufferData[index] = 0;
    mockDevice.triggerInputReport(0x01, bufferData);
  };

  beforeEach(() => {
    document.body.innerHTML = '';

    Object.defineProperty(navigator, 'userActivation', {
      value: {isActive: true},
      writable: true,
      configurable: true,
    });

    deviceListeners = {};
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

    mockHid = {
      getDevices: jest.fn().mockResolvedValue([mockDevice]),
      requestDevice: jest.fn().mockResolvedValue([mockDevice]),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    Object.defineProperty(navigator, 'hid', {
      value: mockHid,
      writable: true,
      configurable: true,
    });

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

    global.Image = class {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
        this.width = 72;
        this.height = 72;
      }
    };

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

  async function enterMeetingRoom() {
    window.history.pushState({}, '', '/abc-defg-hij');
    const streamDeck = new global.StreamDeck();
    await streamDeck.connect();

    const wrapper = new global.MeetWrapper(streamDeck);

    // Add meeting container to trigger mutation observer
    const meetingDiv = document.createElement('div');
    meetingDiv.setAttribute('data-meeting-title', 'Test Meeting');
    document.body.appendChild(meetingDiv);

    // Trigger mutation observer
    await new Promise(process.nextTick);
    return {streamDeck, wrapper};
  }

  describe('Edge Case: Whitespace & Casing in Selectors', () => {
    test(
        'Mic button should match even with extra whitespace and ' +
        'uppercase in aria-label',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.setAttribute('aria-label', ' \n  MUTE MICROPHONE \n  ');
          micBtn.click = jest.fn();
          document.body.appendChild(micBtn);

          // Add dummy cam/hangup buttons to complete setup
          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const micBtnId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micBtnId);

          expect(micBtn.click).toHaveBeenCalled();
        });

    test(
        'Lobby Start Instant button should match even with text content ' +
        'containing trailing tabs/newlines',
        async () => {
          window.history.pushState({}, '', '/');
          const streamDeck = new global.StreamDeck();
          await streamDeck.connect();
          new global.MeetWrapper(streamDeck);

          const instantBtn = document.createElement('button');
          instantBtn.innerHTML = '\n\t Start instant meeting \n';
          instantBtn.click = jest.fn();
          document.body.appendChild(instantBtn);

          await new Promise(process.nextTick);

          const instantBtnId = streamDeck.buttonNameToId('start-instant');
          triggerV2KeyPress(instantBtnId);

          expect(instantBtn.click).toHaveBeenCalled();
        });
  });

  describe('Edge Case: Ambiguous Aria Labels & False Positives', () => {
    test(
        'Mic selector should NOT match Camera button even if Camera ' +
        'button has "Mute camera" aria-label',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Camera button is placed FIRST in the DOM
          const camBtn = document.createElement('button');
          camBtn.setAttribute('id', 'cam-button');
          camBtn.setAttribute('data-is-muted', 'false');
          camBtn.setAttribute('aria-label', 'Mute camera');
          camBtn.click = jest.fn();
          document.body.appendChild(camBtn);

          // Mic button is placed SECOND in the DOM
          const micBtn = document.createElement('button');
          micBtn.setAttribute('id', 'mic-button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.setAttribute('aria-label', 'Mute microphone');
          micBtn.click = jest.fn();
          document.body.appendChild(micBtn);

          // Add dummy hangup button
          const hangupBtn = document.createElement('button');
          hangupBtn.setAttribute('aria-label', 'leave call');
          document.body.appendChild(hangupBtn);

          await new Promise((resolve) => setTimeout(resolve, 150));

          // Trigger Mic key press on StreamDeck
          const micBtnId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micBtnId);

          // Verify that Mic button click was triggered, NOT Camera button click
          console.log('--- CALL COUNTS ---');
          console.log('micBtn.click calls:', micBtn.click.mock.calls.length);
          console.log('camBtn.click calls:', camBtn.click.mock.calls.length);
          expect(micBtn.click).toHaveBeenCalled();
          expect(camBtn.click).not.toHaveBeenCalled();
        });
  });

  describe('Edge Case: SVG Path vs Aria Label scenarios', () => {
    test(
        'Mic selector matches when SVG path matches but aria-label is ' +
        'entirely missing',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.click = jest.fn();

          const svg = document.createElementNS(
              'http://www.w3.org/2000/svg',
              'svg',
          );
          const path = document.createElementNS(
              'http://www.w3.org/2000/svg',
              'path',
          );
          path.setAttribute('d', 'M12 14c1.66 0 ...');
          svg.appendChild(path);
          micBtn.appendChild(svg);
          document.body.appendChild(micBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const micBtnId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micBtnId);

          expect(micBtn.click).toHaveBeenCalled();
        });

    test(
        'Mic selector matches when aria-label matches but SVG path is ' +
        'entirely missing/empty',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.setAttribute('aria-label', 'Mute microphone');
          micBtn.click = jest.fn();
          document.body.appendChild(micBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const micBtnId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micBtnId);

          expect(micBtn.click).toHaveBeenCalled();
        });
  });

  describe('Edge Case: Additional False Positive Scenarios', () => {
    test(
        'Cam selector should NOT match Settings button even if Settings ' +
        'button has "Video settings" data-tooltip',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Settings button is placed FIRST in DOM
          const settingsBtn = document.createElement('button');
          settingsBtn.setAttribute('id', 'settings-button');
          settingsBtn.setAttribute('data-is-muted', 'false');
          settingsBtn.setAttribute('data-tooltip', 'Video settings');
          settingsBtn.click = jest.fn();
          document.body.appendChild(settingsBtn);

          // Camera button is placed SECOND in DOM
          const camBtn = document.createElement('button');
          camBtn.setAttribute('id', 'cam-button');
          camBtn.setAttribute('data-is-muted', 'false');
          camBtn.setAttribute('aria-label', 'Turn off camera');
          camBtn.click = jest.fn();
          document.body.appendChild(camBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const camBtnId = streamDeck.buttonNameToId('cam');
          triggerV2KeyPress(camBtnId);

          // Verify if false positive happened
          console.log('--- CAM CALL COUNTS ---');
          console.log('camBtn.click calls:', camBtn.click.mock.calls.length);
          console.log(
              'settingsBtn.click calls:',
              settingsBtn.click.mock.calls.length,
          );

          expect(camBtn.click).toHaveBeenCalled();
          expect(settingsBtn.click).not.toHaveBeenCalled();
        });

    test(
        'Hand selector should NOT match Moderator button even if Moderator ' +
        'button has "Lower all hands" aria-label',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Moderator button is placed FIRST in DOM
          const modBtn = document.createElement('button');
          modBtn.setAttribute('id', 'mod-button');
          modBtn.setAttribute('aria-label', 'Lower all hands');
          modBtn.click = jest.fn();
          document.body.appendChild(modBtn);

          // User Hand button is placed SECOND in DOM
          const handBtn = document.createElement('button');
          handBtn.setAttribute('id', 'hand-button');
          handBtn.setAttribute('aria-label', 'Raise hand');
          handBtn.click = jest.fn();
          document.body.appendChild(handBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const handBtnId = streamDeck.buttonNameToId('hand');
          triggerV2KeyPress(handBtnId);

          console.log('--- HAND CALL COUNTS ---');
          console.log('handBtn.click calls:', handBtn.click.mock.calls.length);
          console.log('modBtn.click calls:', modBtn.click.mock.calls.length);

          expect(handBtn.click).toHaveBeenCalled();
          expect(modBtn.click).not.toHaveBeenCalled();
        });

    test(
        'Hand selector should NOT match Spanish Moderator button ' +
        'with "Bajar todas las manos" aria-label',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Moderator button is placed FIRST in DOM
          const modBtn = document.createElement('button');
          modBtn.setAttribute('id', 'mod-button-es');
          modBtn.setAttribute('aria-label', 'Bajar todas las manos');
          modBtn.click = jest.fn();
          document.body.appendChild(modBtn);

          // User Hand button is placed SECOND in DOM
          const handBtn = document.createElement('button');
          handBtn.setAttribute('id', 'hand-button-es');
          handBtn.setAttribute('aria-label', 'Levantar la mano');
          handBtn.click = jest.fn();
          document.body.appendChild(handBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const handBtnId = streamDeck.buttonNameToId('hand');
          triggerV2KeyPress(handBtnId);

          expect(handBtn.click).toHaveBeenCalled();
          expect(modBtn.click).not.toHaveBeenCalled();
        });

    test(
        'Mic selector should NOT match German Audio Settings button ' +
        'with "Audio-Einstellungen" data-tooltip',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Settings button is placed FIRST in DOM
          const settingsBtn = document.createElement('button');
          settingsBtn.setAttribute('id', 'audio-settings-de');
          settingsBtn.setAttribute('data-tooltip', 'Audio-Einstellungen');
          settingsBtn.click = jest.fn();
          document.body.appendChild(settingsBtn);

          // Mic button is placed SECOND in DOM
          const micBtn = document.createElement('button');
          micBtn.setAttribute('id', 'mic-button-de');
          micBtn.setAttribute('aria-label', 'Mikrofon stummschalten');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.click = jest.fn();
          document.body.appendChild(micBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const micBtnId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micBtnId);

          expect(micBtn.click).toHaveBeenCalled();
          expect(settingsBtn.click).not.toHaveBeenCalled();
        });

    test(
        'Cam selector should NOT match German Video Settings button ' +
        'with "Video-Einstellungen" data-tooltip',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Settings button is placed FIRST in DOM
          const settingsBtn = document.createElement('button');
          settingsBtn.setAttribute('id', 'video-settings-de');
          settingsBtn.setAttribute('data-tooltip', 'Video-Einstellungen');
          settingsBtn.click = jest.fn();
          document.body.appendChild(settingsBtn);

          // Cam button is placed SECOND in DOM
          const camBtn = document.createElement('button');
          camBtn.setAttribute('id', 'cam-button-de');
          camBtn.setAttribute('aria-label', 'Kamera ausschalten');
          camBtn.setAttribute('data-is-muted', 'false');
          camBtn.click = jest.fn();
          document.body.appendChild(camBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const camBtnId = streamDeck.buttonNameToId('cam');
          triggerV2KeyPress(camBtnId);

          expect(camBtn.click).toHaveBeenCalled();
          expect(settingsBtn.click).not.toHaveBeenCalled();
        });

    test(
        'Present-stop selector should NOT match "Stop recording" button ' +
        'with "Stop recording" aria-label',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Recording button is placed FIRST in DOM
          const recBtn = document.createElement('button');
          recBtn.setAttribute('id', 'rec-button');
          recBtn.setAttribute('aria-label', 'Stop recording');
          recBtn.click = jest.fn();
          document.body.appendChild(recBtn);

          // Stop presenting button is placed SECOND in DOM
          const presentStopBtn = document.createElement('button');
          presentStopBtn.setAttribute('id', 'present-stop-button');
          presentStopBtn.setAttribute('aria-label', 'Stop presenting');
          presentStopBtn.click = jest.fn();
          document.body.appendChild(presentStopBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const presentStopBtnId = streamDeck.buttonNameToId('present-stop');
          triggerV2KeyPress(presentStopBtnId);

          expect(presentStopBtn.click).toHaveBeenCalled();
          expect(recBtn.click).not.toHaveBeenCalled();
        });
  });

  describe('Localization Stress Tests (SVG Missing Fallbacks)', () => {
    test(
        'CC button with Spanish (Subtítulos) labels ' +
        'should be matched when SVG is missing',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const ccBtnSpanish = document.createElement('button');
          ccBtnSpanish.setAttribute('aria-label', 'Activar subtítulos');
          ccBtnSpanish.click = jest.fn();
          document.body.appendChild(ccBtnSpanish);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const ccBtnId = streamDeck.buttonNameToId('cc');
          triggerV2KeyPress(ccBtnId);

          expect(ccBtnSpanish.click).toHaveBeenCalled();
        });

    test(
        'CC button with German (Untertitel) labels ' +
        'should be matched when SVG is missing',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const ccBtnGerman = document.createElement('button');
          ccBtnGerman.setAttribute('aria-label', 'Untertitel einschalten');
          ccBtnGerman.click = jest.fn();
          document.body.appendChild(ccBtnGerman);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const ccBtnId = streamDeck.buttonNameToId('cc');
          triggerV2KeyPress(ccBtnId);

          expect(ccBtnGerman.click).toHaveBeenCalled();
        });

    test(
        'Activities button with Spanish (Actividades) label ' +
        'should be matched when SVG is missing',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const actBtnSpanish = document.createElement('button');
          actBtnSpanish.setAttribute('aria-label', 'Actividades');
          actBtnSpanish.click = jest.fn();
          document.body.appendChild(actBtnSpanish);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const actBtnId = streamDeck.buttonNameToId('activities');
          triggerV2KeyPress(actBtnId);

          expect(actBtnSpanish.click).toHaveBeenCalled();
        });

    test(
        'Info button with Spanish (Detalles de la reunión) label ' +
        'should be matched when SVG is missing',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          const infoBtnSpanish = document.createElement('button');
          infoBtnSpanish.setAttribute('aria-label', 'Detalles de la reunión');
          infoBtnSpanish.click = jest.fn();
          document.body.appendChild(infoBtnSpanish);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const infoBtnId = streamDeck.buttonNameToId('info');
          triggerV2KeyPress(infoBtnId);

          expect(infoBtnSpanish.click).toHaveBeenCalled();
        });
  });

  describe('False Positive Stress: Settings & Secondary Buttons', () => {
    test('CC selector should NOT match Caption Settings button', async () => {
      const {streamDeck} = await enterMeetingRoom();

      // Caption Settings button placed first
      const settingsBtn = document.createElement('button');
      settingsBtn.setAttribute('aria-label', 'Caption settings');
      settingsBtn.click = jest.fn();
      document.body.appendChild(settingsBtn);

      // CC toggle button placed second
      const ccBtn = document.createElement('button');
      ccBtn.setAttribute('aria-label', 'Turn on captions');
      ccBtn.click = jest.fn();
      document.body.appendChild(ccBtn);

      const dummyHangup = document.createElement('button');
      dummyHangup.setAttribute('aria-label', 'leave call');
      document.body.appendChild(dummyHangup);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const ccBtnId = streamDeck.buttonNameToId('cc');
      triggerV2KeyPress(ccBtnId);

      expect(ccBtn.click).toHaveBeenCalled();
      expect(settingsBtn.click).not.toHaveBeenCalled();
    });

    test(
        'Mic selector should NOT match Audio Settings or Test ' +
        'Microphone buttons',
        async () => {
          const {streamDeck} = await enterMeetingRoom();

          // Audio Settings button placed first
          const audioSettingsBtn = document.createElement('button');
          audioSettingsBtn.setAttribute('aria-label', 'Audio settings');
          audioSettingsBtn.click = jest.fn();
          document.body.appendChild(audioSettingsBtn);

          // Test Mic button placed second
          const testMicBtn = document.createElement('button');
          testMicBtn.setAttribute('aria-label', 'Test microphone');
          testMicBtn.click = jest.fn();
          document.body.appendChild(testMicBtn);

          // Actual Mic button placed third
          const micBtn = document.createElement('button');
          micBtn.setAttribute('data-is-muted', 'false');
          micBtn.setAttribute('aria-label', 'Mute microphone');
          micBtn.click = jest.fn();
          document.body.appendChild(micBtn);

          const dummyHangup = document.createElement('button');
          dummyHangup.setAttribute('aria-label', 'leave call');
          document.body.appendChild(dummyHangup);

          await new Promise((resolve) => setTimeout(resolve, 150));

          const micBtnId = streamDeck.buttonNameToId('mic');
          triggerV2KeyPress(micBtnId);

          expect(micBtn.click).toHaveBeenCalled();
          expect(audioSettingsBtn.click).not.toHaveBeenCalled();
          expect(testMicBtn.click).not.toHaveBeenCalled();
        });
  });
});

