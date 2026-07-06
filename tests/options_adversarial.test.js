/* eslint-env jest, node */

const fs = require('fs');
const path = require('path');

describe('Options Page Adversarial Stress-Testing', () => {
  let mockGet;
  let mockSet;
  let domContentLoadedHandler;

  beforeEach(() => {
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

    // Set up JSDOM context
    const htmlPath = path.resolve(__dirname, '../src/options.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');
    document.documentElement.innerHTML = htmlCode;

    document.addEventListener = jest.fn((event, handler) => {
      if (event === 'DOMContentLoaded') {
        domContentLoadedHandler = handler;
      }
    });

    const jsPath = path.resolve(__dirname, '../src/options.js');
    const jsCode = fs.readFileSync(jsPath, 'utf8');
    new Function('', jsCode)();
  });

  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
    document.documentElement.innerHTML = '';
  });

  describe('1. Overlapping/duplicated key mappings', () => {
    test('should allow duplicate key mappings in options page and display them in preview', async () => {
      // Set mic and cam to same key 10
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

      await domContentLoadedHandler();

      const micSelect = document.getElementById('action-mic');
      const camSelect = document.getElementById('action-cam');
      expect(micSelect.value).toBe('10');
      expect(camSelect.value).toBe('10');

      // Verify key 10 has both 'mic' and 'cam' action tags
      const previewGrid = document.getElementById('sd-preview-grid');
      const key10 = previewGrid.children[10];
      expect(key10.classList.contains('active')).toBe(true);
      expect(key10.textContent).toContain('mic');
      expect(key10.textContent).toContain('cam');

      const actionTags = key10.querySelectorAll('.sd-key-action-tag');
      expect(actionTags.length).toBe(2);
      expect(actionTags[0].textContent).toBe('mic');
      expect(actionTags[1].textContent).toBe('cam');
    });
  });

  describe('2. Out-of-bounds key indices', () => {
    test('should handle string numeric indices (type coercion issues)', async () => {
      // Storage contains key index as string '10' instead of number 10
      const customMappings = {
        'mic': '10',
        'mic-disabled': '10',
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': customMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      // Check form value: browser will match string '10' with option value '10'
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('10');

      // Check preview: strict equality '=== 10' fails because '10' !== 10
      const previewGrid = document.getElementById('sd-preview-grid');
      const key10 = previewGrid.children[10];
      
      // CHALLENGER OBSERVED FAILURE MODE:
      // The preview grid key 10 will NOT show 'mic' because of strict comparison in options.js
      expect(key10.textContent).not.toContain('mic');
      expect(key10.classList.contains('active')).toBe(false);
    });

    test('should handle non-numeric/invalid key indices gracefully in Options UI', async () => {
      const customMappings = {
        'mic': 'invalid_string',
        'cam': -5,
        'hand': 99,
      };

      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': customMappings };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      // The select elements should fall back to default or empty selected option
      const micSelect = document.getElementById('action-mic');
      const camSelect = document.getElementById('action-cam');
      const handSelect = document.getElementById('action-hand');

      // Non-existent option values in HTML select will reset to default or first option (-1/Disabled in options.html context)
      // JSDOM select.value matches empty string "" if value is not an option
      expect(micSelect.value).toBe('');
      expect(camSelect.value).toBe('');
      expect(handSelect.value).toBe('');

      // Preview grid should NOT contain these invalid keys or crash
      const previewGrid = document.getElementById('sd-preview-grid');
      expect(previewGrid.children.length).toBe(15);
      for (let i = 0; i < 15; i++) {
        const key = previewGrid.children[i];
        expect(key.textContent).not.toContain('mic');
        expect(key.textContent).not.toContain('cam');
        expect(key.textContent).not.toContain('hand');
      }

      // CHALLENGER OBSERVED FAILURE MODE:
      // If we submit the form now, it will parse "" as NaN and save NaN to storage!
      const form = document.getElementById('mappings-form');
      form.dispatchEvent(new Event('submit'));

      expect(mockSet).toHaveBeenCalled();
      const saveObj = mockSet.mock.calls[0][0];
      expect(saveObj.mappings_v2.mic).toBeNaN();
      expect(saveObj.mappings_v2.cam).toBeNaN();
      expect(saveObj.mappings_v2.hand).toBeNaN();
    });
  });

  describe('3. Graceful handling of storage failures', () => {
    test('should fallback to defaults when chrome.storage.local.get throws an error', async () => {
      mockGet.mockRejectedValue(new Error('Storage failure simulated'));

      await domContentLoadedHandler();

      // Verify that default v2 mappings are loaded instead of crashing
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('10'); // default mic for v2 is 10

      const camSelect = document.getElementById('action-cam');
      expect(camSelect.value).toBe('11'); // default cam for v2 is 11
    });

    test('should fallback to defaults when chrome.storage.local.get returns undefined result', async () => {
      mockGet.mockImplementation((key, callback) => {
        if (callback) callback(undefined);
        return Promise.resolve(undefined);
      });

      await domContentLoadedHandler();

      // It should catch error or handle undefined cleanly and load defaults
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('10');
    });

    test('should fallback to defaults when chrome.storage.local.get returns empty object', async () => {
      mockGet.mockImplementation((key, callback) => {
        const res = {};
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('10');
    });

    test('should handle truthy corrupted non-object storage value (without crashing)', async () => {
      mockGet.mockImplementation((key, callback) => {
        const res = { 'mappings_v2': 123 };
        if (callback) callback(res);
        return Promise.resolve(res);
      });

      await domContentLoadedHandler();

      // Since 123 is truthy, it spreads {...123} -> {}
      // This results in empty mappings, so everything gets set to -1 (Disabled)
      const micSelect = document.getElementById('action-mic');
      expect(micSelect.value).toBe('-1'); // It falls back to empty, disabling buttons, doesn't crash
    });
  });

  describe('4. Real-time DOM interaction and visual preview updates in JSDOM', () => {
    test('should dynamically update the preview grid class and tags on dropdown change', async () => {
      mockGet.mockImplementation((key, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      });

      await domContentLoadedHandler();

      const micSelect = document.getElementById('action-mic');
      const previewGrid = document.getElementById('sd-preview-grid');

      // Check initial active keys (default mic is 10, default cam is 11)
      expect(previewGrid.children[10].classList.contains('active')).toBe(true);
      expect(previewGrid.children[10].textContent).toContain('mic');

      // Change selection to 5
      micSelect.value = '5';
      micSelect.dispatchEvent(new Event('change'));

      // Key 10 should no longer be active for mic
      expect(previewGrid.children[10].textContent).not.toContain('mic');
      
      // Key 5 should now be active and contain 'mic'
      expect(previewGrid.children[5].classList.contains('active')).toBe(true);
      expect(previewGrid.children[5].textContent).toContain('mic');
    });
  });
});
