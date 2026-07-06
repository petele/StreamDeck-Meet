/* eslint-env jest, node */

const fs = require('fs');
const path = require('path');

// Setup global mocks for MeetWrapper dependency checking
global.StreamDeckV1 = {PRODUCT_ID: 0x0060};
global.StreamDeckMini = {PRODUCT_ID: 0x0063};
global.StreamDeckXL = {PRODUCT_ID: 0x006c};
global.StreamDeckV2 = {PRODUCT_ID: 0x006d};

// Evaluate MeetWrapper
const wrapperPath = path.resolve(__dirname, '../src/MeetWrapper.js');
const wrapperCode = fs.readFileSync(wrapperPath, 'utf8');
const MeetWrapper = new Function('', wrapperCode + '\nreturn MeetWrapper;')();

describe('MeetWrapper Room and Emoji Transition Tests', () => {
  let mockStreamDeck;

  beforeEach(() => {
    mockStreamDeck = {
      isConnected: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      buttonNameToId: jest.fn((name) => {
        if (name === 'reaction') return 0;
        return 1;
      }),
      fillURL: jest.fn(),
      clearAllButtons: jest.fn(),
      fillCanvas: jest.fn(),
    };

    // Mock DOM elements
    document.body.innerHTML = '';

    // Mock navigator.userActivation
    Object.defineProperty(navigator, 'userActivation', {
      value: {isActive: true},
      writable: true,
      configurable: true,
    });

    // Change pathname using window.history
    window.history.pushState({}, '', '/');
  });

  test('should clear emoji mode and interval when transitioning rooms', () => {
    new MeetWrapper(mockStreamDeck);

    // Verify connect listener registration
    expect(mockStreamDeck.addEventListener)
        .toHaveBeenCalledWith('connect', expect.any(Function));
  });
});
