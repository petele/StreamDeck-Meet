/* eslint-env jest, node */

const fs = require('fs');
const path = require('path');

describe('Chrome Extension Options Page', () => {
  let mockGet;
  let mockSet;
  let domContentLoadedHandler;

  beforeEach(() => {
    // 1. Mock the chrome storage API
    mockGet = jest.fn();
    mockSet = jest.fn().mockResolvedValue();
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: mockSet,
        },
      },
    };

    // 2. Set up HTML DOM using JSDOM (provided by Jest environment 'jsdom')
    const htmlPath = path.resolve(__dirname, '../src/options.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');
    document.documentElement.innerHTML = htmlCode;

    // 3. Mock window/document event listeners to intercept DOMContentLoaded
    document.addEventListener = jest.fn((event, handler) => {
      if (event === 'DOMContentLoaded') {
        domContentLoadedHandler = handler;
      }
    });

    // 4. Load options.js code
    const jsPath = path.resolve(__dirname, '../src/options.js');
    const jsCode = fs.readFileSync(jsPath, 'utf8');
    
    // We run the JS script in the context of our tests
    // JSDOM has document.getElementById etc. set up.
    new Function('', jsCode)();
  });

  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
    document.documentElement.innerHTML = '';
  });

  test('should initialize and load defaults when storage is empty', async () => {
    // Mock get returning empty object (no mappings saved yet)
    mockGet.mockImplementation((key, callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    });

    // Trigger DOMContentLoaded
    expect(domContentLoadedHandler).toBeDefined();
    await domContentLoadedHandler();

    // Verify chrome.storage.local.get was called with 'mappings_v2'
    expect(mockGet).toHaveBeenCalledWith('mappings_v2');

    // Verify form was populated with defaults for v2
    // default mic for v2 is key 10
    const micSelect = document.getElementById('action-mic');
    expect(micSelect).toBeDefined();
    expect(micSelect.value).toBe('10');

    // default cam for v2 is key 11
    const camSelect = document.getElementById('action-cam');
    expect(camSelect).toBeDefined();
    expect(camSelect.value).toBe('11');

    // Verify key 10 in preview grid is active and has mic label
    const previewGrid = document.getElementById('sd-preview-grid');
    expect(previewGrid.children.length).toBe(15); // V2 has 15 keys
    
    // Key 10 is the 11th child (0-indexed 10)
    const key10 = previewGrid.children[10];
    expect(key10.classList.contains('active')).toBe(true);
    expect(key10.textContent).toContain('mic');
  });

  test('should load custom mappings from storage when present', async () => {
    // Custom mappings: mic on key 2, cam on key 3, others disabled (-1)
    const customMappings = {
      'mic': 2,
      'mic-disabled': 2,
      'cam': 3,
      'cam-disabled': 3,
    };

    mockGet.mockImplementation((key, callback) => {
      const res = {'mappings_v2': customMappings};
      if (callback) callback(res);
      return Promise.resolve(res);
    });

    await domContentLoadedHandler();

    const micSelect = document.getElementById('action-mic');
    expect(micSelect.value).toBe('2');

    const camSelect = document.getElementById('action-cam');
    expect(camSelect.value).toBe('3');

    // Verify key 2 is active with mic, key 3 is active with cam
    const previewGrid = document.getElementById('sd-preview-grid');
    const key2 = previewGrid.children[2];
    expect(key2.classList.contains('active')).toBe(true);
    expect(key2.textContent).toContain('mic');

    const key3 = previewGrid.children[3];
    expect(key3.classList.contains('active')).toBe(true);
    expect(key3.textContent).toContain('cam');
  });

  test('should update preview grid when a dropdown selection changes', async () => {
    mockGet.mockImplementation((key, callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    });

    await domContentLoadedHandler();

    const micSelect = document.getElementById('action-mic');
    
    // Change mic key from default 10 to 5
    micSelect.value = '5';
    micSelect.dispatchEvent(new Event('change'));

    // Verify key 5 is now active and displays 'mic'
    const previewGrid = document.getElementById('sd-preview-grid');
    const key5 = previewGrid.children[5];
    expect(key5.classList.contains('active')).toBe(true);
    expect(key5.textContent).toContain('mic');
    
    // Key 10 should no longer contain 'mic'
    const key10 = previewGrid.children[10];
    expect(key10.textContent).not.toContain('mic');
  });

  test('should save new mappings when form is submitted', async () => {
    mockGet.mockImplementation((key, callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    });

    await domContentLoadedHandler();

    // Change mic key to 8
    const micSelect = document.getElementById('action-mic');
    micSelect.value = '8';
    micSelect.dispatchEvent(new Event('change'));

    // Submit form
    const form = document.getElementById('mappings-form');
    form.dispatchEvent(new Event('submit'));

    // Verify set was called
    expect(mockSet).toHaveBeenCalled();
    const saveObj = mockSet.mock.calls[0][0];
    expect(saveObj.mappings_v2).toBeDefined();
    expect(saveObj.mappings_v2.mic).toBe(8);
    expect(saveObj.mappings_v2['mic-disabled']).toBe(8); // linked key updated
  });

  test('should change layout and keys when device model is switched', async () => {
    mockGet.mockImplementation((key, callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    });

    await domContentLoadedHandler();

    const deviceModelSelect = document.getElementById('device-model');
    
    // Switch to mini (6 keys)
    deviceModelSelect.value = 'mini';
    deviceModelSelect.dispatchEvent(new Event('change'));

    // Wait for async settings load to resolve
    await new Promise(process.nextTick);

    // Verify it requested 'mappings_mini' from storage
    expect(mockGet).toHaveBeenCalledWith('mappings_mini');

    // Verify preview grid now shows 6 keys
    const previewGrid = document.getElementById('sd-preview-grid');
    expect(previewGrid.children.length).toBe(6);

    // Default mic on mini is key 4
    const micSelect = document.getElementById('action-mic');
    expect(micSelect.value).toBe('4');

    // Keys dropdowns should have options from 1 to 6
    const options = micSelect.querySelectorAll('option');
    expect(options.length).toBe(7); // 6 keys + 1 disabled option
    expect(options[1].value).toBe('1');
    expect(options[6].value).toBe('6');
  });

  test('should reset to defaults when reset button is clicked', async () => {
    // Mock user confirmation
    global.confirm = jest.fn().mockReturnValue(true);

    mockGet.mockImplementation((key, callback) => {
      // Load custom mappings initially
      const custom = {mic: 1, 'mic-disabled': 1};
      const res = {'mappings_v2': custom};
      if (callback) callback(res);
      return Promise.resolve(res);
    });

    await domContentLoadedHandler();

    const micSelect = document.getElementById('action-mic');
    expect(micSelect.value).toBe('1');

    // Click reset
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.dispatchEvent(new Event('click'));

    // Verify confirm dialog was shown
    expect(global.confirm).toHaveBeenCalled();

    // Verify value reset to default (10 for v2) by querying the new element
    const newMicSelect = document.getElementById('action-mic');
    expect(newMicSelect.value).toBe('10');
  });
});
