/* eslint-env jest, node */

// Mock Chrome extension APIs
global.chrome = {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://dummy-id/${path}`),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
    },
  },
};

// Mock WebHID API
const mockHid = {
  getDevices: jest.fn().mockResolvedValue([]),
  requestDevice: jest.fn().mockResolvedValue([]),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

Object.defineProperty(navigator, 'hid', {
  value: mockHid,
  writable: true,
  configurable: true,
});
