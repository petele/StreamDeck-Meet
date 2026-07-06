/* eslint-env jest, node */

const fs = require('fs');
const path = require('path');

// Setup global mocks
global.StreamDeckV1 = {PRODUCT_ID: 0x0060};
global.StreamDeckMini = {PRODUCT_ID: 0x0063};
global.StreamDeckXL = {PRODUCT_ID: 0x006c};

// Evaluate StreamDeckV2
const v2Path = path.resolve(__dirname, '../src/StreamDeckV2.js');
const v2Code = fs.readFileSync(v2Path, 'utf8');
const StreamDeckV2 = new Function('', v2Code + '\nreturn StreamDeckV2;')();
global.StreamDeckV2 = StreamDeckV2;

// Evaluate StreamDeck
const sdPath = path.resolve(__dirname, '../src/StreamDeck.js');
const sdCode = fs.readFileSync(sdPath, 'utf8');
const StreamDeck = new Function('', sdCode + '\nreturn StreamDeck;')();

// Stub OffscreenCanvas
global.OffscreenCanvas = class {
  /**
   * Mock OffscreenCanvas constructor.
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * Mock getContext method.
   * @return {object}
   */
  getContext() {
    return {
      fillStyle: '',
      fillRect: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      rotate: jest.fn(),
      drawImage: jest.fn(),
    };
  }

  /**
   * Mock convertToBlob method.
   * @return {Promise}
   */
  convertToBlob() {
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });
  }
};

describe('StreamDeck Out-of-Order and Connection Tests', () => {
  let streamDeck;
  let mockDevice;
  let imageInstances;

  beforeEach(() => {
    mockDevice = {
      opened: true,
      vendorId: 0x0fd9,
      productId: StreamDeckV2.PRODUCT_ID,
      open: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
      addEventListener: jest.fn(),
      sendReport: jest.fn().mockResolvedValue(true),
    };

    navigator.hid.getDevices = jest.fn().mockResolvedValue([mockDevice]);

    imageInstances = [];
    global.Image = class {
      /**
       * Mock Image constructor.
       */
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
        this.width = 72;
        this.height = 72;
        imageInstances.push(this);
      }
    };

    streamDeck = new StreamDeck();
  });

  test('should connect and filter supported device type', async () => {
    const connected = await streamDeck.connect();
    expect(connected).toBe(true);
    expect(streamDeck.isConnected).toBe(true);
  });

  test('should handle fillURL race conditions', async () => {
    await streamDeck.connect();

    // Call fillURL twice concurrently on the same button
    const p1 = streamDeck.fillURL(1, 'http://first-image.png');
    const p2 = streamDeck.fillURL(1, 'http://second-image.png');

    expect(imageInstances.length).toBe(2);

    // Resolve second request first
    imageInstances[1].onload();
    await p2;

    // Resolve first request second
    imageInstances[0].onload();
    await p1;

    // Verify command queue contains packets only from the second image.
    // Each draw call pushes packets to the send queue.
    const calls = mockDevice.sendReport.mock.calls;
    calls.forEach((call) => {
      const data = call[1];
      // header bytes: index 0 reportId (0x02), index 1 action (0x07),
      // index 2 buttonId (1)
      expect(data[1]).toBe(1);
    });

    // p1 is discarded, so only 1 set of packets should be sent.
    expect(calls.length).toBe(1);
  });

  test('should load custom mappings from chrome.storage.local on connect', async () => {
    // Mock chrome.storage.local.get to return a custom mapping for v2
    const customMappings = {
      mic: 77,
      cam: 88,
    };
    chrome.storage.local.get = jest.fn().mockResolvedValue({
      mappings_v2: customMappings,
    });

    await streamDeck.connect();

    // Verify it requested mappings_v2
    expect(chrome.storage.local.get).toHaveBeenCalledWith('mappings_v2');

    // Verify the mappings are applied
    expect(streamDeck.buttonNameToId('mic')).toBe(77);
    expect(streamDeck.buttonNameToId('cam')).toBe(88);
    // Verify default value is still used for unspecified keys (e.g. reaction is 0 for v2)
    expect(streamDeck.buttonNameToId('reaction')).toBe(0);
  });
});

