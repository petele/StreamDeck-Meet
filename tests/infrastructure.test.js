/* eslint-env jest, node */

describe('Infrastructure and Mocks Setup', () => {
  test('chrome.runtime.getURL returns a dummy string', () => {
    expect(chrome.runtime.getURL).toBeDefined();
    const url = chrome.runtime.getURL('test.png');
    expect(url).toBe('chrome-extension://dummy-id/test.png');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('test.png');
  });

  test('navigator.hid should be mocked with required methods', async () => {
    expect(navigator.hid).toBeDefined();
    expect(navigator.hid.getDevices).toBeDefined();
    expect(navigator.hid.requestDevice).toBeDefined();
    expect(navigator.hid.addEventListener).toBeDefined();
    expect(navigator.hid.removeEventListener).toBeDefined();

    const devices = await navigator.hid.getDevices();
    expect(devices).toEqual([]);
    expect(navigator.hid.getDevices).toHaveBeenCalled();
  });
});

