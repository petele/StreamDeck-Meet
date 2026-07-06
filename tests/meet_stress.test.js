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

// Expose private methods by rewriting the class source code slightly
const loadExposedMeetWrapper = () => {
  const code = fs.readFileSync(
      path.resolve(__dirname, '../src/MeetWrapper.js'),
      'utf8',
  );
  const exposedCode = code.replace(
      'class MeetWrapper {',
      `class MeetWrapper {
        __getPrivate(name) {
          switch(name) {
            case 'getMicButton': return this.#getMicButton();
            case 'getCamButton': return this.#getCamButton();
            case 'getCCButton': return this.#getCCButton();
            case 'getHandButton': return this.#getHandButton();
            case 'getReactionButton': return this.#getReactionButton();
            case 'getHangupButton': return this.#getHangupButton();
            case 'getGreenRoomMicButton': return this.#getGreenRoomMicButton();
            case 'getGreenRoomCamButton': return this.#getGreenRoomCamButton();
            case 'getStartInstantMeetingButton': return this.#getStartInstantMeetingButton();
            case 'getStartNextMeetingButton': return this.#getStartNextMeetingButton();
            case 'getRejoinButton': return this.#getRejoinButton();
            case 'getReturnToHomeButton': return this.#getReturnToHomeButton();
            case 'getInfoButton': return this.#getInfoButton();
            case 'getPeopleButton': return this.#getPeopleButton();
            case 'getChatButton': return this.#getChatButton();
            case 'getActivitiesButton': return this.#getActivitiesButton();
            case 'getStopPresentingButton': return this.#getStopPresentingButton();
            case 'getEnterMeetingButton': return this.#getEnterMeetingButton();
            default: throw new Error('Unknown private method: ' + name);
          }
        }`,
  );
  return new Function('', exposedCode + '\nreturn MeetWrapper;')();
};

const MeetWrapper = loadExposedMeetWrapper();

describe('MeetWrapper DOM Selectors Stress Tests', () => {
  let mockStreamDeck;
  let wrapper;

  beforeEach(() => {
    mockStreamDeck = {
      isConnected: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      buttonNameToId: jest.fn(),
      fillURL: jest.fn(),
      clearAllButtons: jest.fn(),
      fillCanvas: jest.fn(),
    };
    // Mock navigator.userActivation
    Object.defineProperty(navigator, 'userActivation', {
      value: {isActive: true},
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
    wrapper = new MeetWrapper(mockStreamDeck);
  });

  // helper to create svg path inside element
  function addSvgPath(element, pathData) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const pathEl = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    pathEl.setAttribute('d', pathData);
    svg.appendChild(pathEl);
    element.appendChild(svg);
  }

  describe('Whitespace Resilience tests', () => {
    test('Mic button selector handles extreme whitespace in aria-label', () => {
      const micBtn = document.createElement('button');
      micBtn.setAttribute('aria-label', ' \n\r\t Microphone \t\r\n ');
      micBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(micBtn);

      const found = wrapper.__getPrivate('getMicButton');
      expect(found).toBe(micBtn);
    });

    test('Camera button selector handles whitespace in data-tooltip', () => {
      const camBtn = document.createElement('button');
      camBtn.setAttribute('data-tooltip', ' \n\r\t caméra \t\r\n ');
      camBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(camBtn);

      const found = wrapper.__getPrivate('getCamButton');
      expect(found).toBe(camBtn);
    });

    test('Lobby Start Instant button selector handles whitespace', () => {
      const instantBtn = document.createElement('button');
      instantBtn.textContent = ' \n\r\t instant \t\r\n ';
      document.body.appendChild(instantBtn);

      const found = wrapper.__getPrivate('getStartInstantMeetingButton');
      expect(found).toBe(instantBtn);
    });
  });

  describe('Ambiguity & False Positive Prevention tests', () => {
    test('Mic selector does not match mic settings button', () => {
      // Create a mic settings button
      // (similar aria-label but no data-is-muted / different structure)
      const settingsBtn = document.createElement('button');
      settingsBtn.setAttribute('aria-label', 'Microphone settings');
      document.body.appendChild(settingsBtn);

      // Create actual mic toggle button
      const micBtn = document.createElement('button');
      micBtn.setAttribute('aria-label', 'Mute microphone');
      micBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(micBtn);

      const found = wrapper.__getPrivate('getMicButton');
      expect(found).toBe(micBtn);
    });

    test('Mic selector does not match camera button when both present', () => {
      const camBtn = document.createElement('button');
      camBtn.setAttribute('aria-label', 'camera');
      camBtn.setAttribute('data-is-muted', 'false');
      addSvgPath(camBtn, 'M18 10.48');

      const micBtn = document.createElement('button');
      micBtn.setAttribute('aria-label', 'microphone');
      micBtn.setAttribute('data-is-muted', 'false');
      addSvgPath(micBtn, 'M12 14');

      document.body.appendChild(camBtn);
      document.body.appendChild(micBtn);

      const foundMic = wrapper.__getPrivate('getMicButton');
      const foundCam = wrapper.__getPrivate('getCamButton');

      expect(foundMic).toBe(micBtn);
      expect(foundCam).toBe(camBtn);
    });

    test('Mic selector ignores Mute camera label', () => {
      const camBtn = document.createElement('button');
      camBtn.setAttribute('aria-label', 'Mute camera');
      camBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(camBtn);

      const micBtn = document.createElement('button');
      micBtn.setAttribute('aria-label', 'Mute microphone');
      micBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(micBtn);

      const foundMic = wrapper.__getPrivate('getMicButton');
      expect(foundMic).toBe(micBtn);
    });

    test('Cam selector ignores Video settings tooltip', () => {
      const settingsBtn = document.createElement('button');
      settingsBtn.setAttribute('data-tooltip', 'Video settings');
      settingsBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(settingsBtn);

      const camBtn = document.createElement('button');
      camBtn.setAttribute('aria-label', 'Turn off camera');
      camBtn.setAttribute('data-is-muted', 'false');
      document.body.appendChild(camBtn);

      const foundCam = wrapper.__getPrivate('getCamButton');
      expect(foundCam).toBe(camBtn);
    });

    test('Hand selector ignores Lower all hands label', () => {
      const modBtn = document.createElement('button');
      modBtn.setAttribute('aria-label', 'Lower all hands');
      document.body.appendChild(modBtn);

      const handBtn = document.createElement('button');
      handBtn.setAttribute('aria-label', 'Raise hand');
      document.body.appendChild(handBtn);

      const foundHand = wrapper.__getPrivate('getHandButton');
      expect(foundHand).toBe(handBtn);
    });

    test('CC selector does not match Hand button when both in DOM', () => {
      const handBtn = document.createElement('button');
      handBtn.setAttribute('aria-label', 'Raise hand');
      addSvgPath(handBtn, 'M18 24');

      const ccBtn = document.createElement('button');
      ccBtn.setAttribute('aria-label', 'Captions');
      addSvgPath(ccBtn, 'M19.5 5.5');

      document.body.appendChild(handBtn);
      document.body.appendChild(ccBtn);

      const foundHand = wrapper.__getPrivate('getHandButton');
      const foundCC = wrapper.__getPrivate('getCCButton');

      expect(foundHand).toBe(handBtn);
      expect(foundCC).toBe(ccBtn);
    });
  });

  describe('Missing aria-labels but SVG path present (robust fallback)', () => {
    test('finds mic button via SVG path prefix', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-is-muted', 'false');
      addSvgPath(btn, 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getMicButton');
      expect(found).toBe(btn);
    });

    test('finds camera button via SVG path prefix', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-is-muted', 'false');
      addSvgPath(
          btn,
          'M18 10.48V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12' +
          'c1.1 0 2-.9 2-2v-4.48l4 4v-11l-4 4z',
      );
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getCamButton');
      expect(found).toBe(btn);
    });

    test('finds Start Instant Meeting button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M19 13H5');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getStartInstantMeetingButton');
      expect(found).toBe(btn);
    });

    test('finds Start Next Meeting button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M20 5H4');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getStartNextMeetingButton');
      expect(found).toBe(btn);
    });

    test('finds Enter Meeting button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M12 4v');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getEnterMeetingButton');
      expect(found).toBe(btn);
    });

    test('finds Rejoin button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M12 6v');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getRejoinButton');
      expect(found).toBe(btn);
    });

    test('finds Return to Home button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M10 20');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getReturnToHomeButton');
      expect(found).toBe(btn);
    });

    test('finds Stop Presenting button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M21 3');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getStopPresentingButton');
      expect(found).toBe(btn);
    });

    test('finds Hang Up button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M23.62 11.27');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getHangupButton');
      expect(found).toBe(btn);
    });

    test('finds Info panel button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M11 17');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getInfoButton');
      expect(found).toBe(btn);
    });

    test('finds People panel button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M9 8c');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getPeopleButton');
      expect(found).toBe(btn);
    });

    test('finds Chat panel button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M20 2H4');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getChatButton');
      expect(found).toBe(btn);
    });

    test('finds Activities panel button via SVG path prefix', () => {
      const btn = document.createElement('button');
      addSvgPath(btn, 'M12 2l');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getActivitiesButton');
      expect(found).toBe(btn);
    });
  });

  describe('Missing SVG paths but aria-label / data-tooltip present', () => {
    test('finds reaction button via aria-label pattern', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Send a reaction');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getReactionButton');
      expect(found).toBe(btn);
    });

    test('finds Info panel button via aria-label pattern', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Meeting details');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getInfoButton');
      expect(found).toBe(btn);
    });

    test('finds People panel button via aria-label pattern', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Show everyone');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getPeopleButton');
      expect(found).toBe(btn);
    });

    test('finds Chat panel button via aria-label pattern', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Chat with everyone');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getChatButton');
      expect(found).toBe(btn);
    });

    test('finds Activities panel button via aria-label pattern', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Activities');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getActivitiesButton');
      expect(found).toBe(btn);
    });

    test('finds rejoin button via aria-label fallback', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Rejoin meeting');
      document.body.appendChild(btn);

      const found = wrapper.__getPrivate('getRejoinButton');
      expect(found).toBe(btn);
    });
  });

  describe('Primary selector works first', () => {
    test('prefer primary selector [jscontroller=eB6kvd] for mic button', () => {
      // Create a dummy button with same SVG path but wrong jscontroller
      const wrongBtn = document.createElement('button');
      wrongBtn.setAttribute('data-is-muted', 'false');
      addSvgPath(wrongBtn, 'M12 14');
      document.body.appendChild(wrongBtn);

      // Create primary button with jscontroller and correct child
      const primaryContainer = document.createElement('div');
      primaryContainer.setAttribute('jscontroller', 'eB6kvd');
      const correctBtn = document.createElement('button');
      correctBtn.setAttribute('data-is-muted', 'false');
      primaryContainer.appendChild(correctBtn);
      document.body.appendChild(primaryContainer);

      const found = wrapper.__getPrivate('getMicButton');
      expect(found).toBe(correctBtn);
    });
  });
});
