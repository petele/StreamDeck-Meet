/*
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable no-invalid-this */

'use strict';

/**
 *
 * @module StreamDeck
 */
class StreamDeck { // eslint-disable-line

  #device;
  #deviceType;
  #keyState;
  #isSupported = false;

  #commandQueue = [];
  #isQueueRunning = false;

  #imageCache = {};

  /**
   * Constructor
   */
  constructor() {
    this.#isSupported = 'hid' in navigator;

    // Handle behaviour when the device is connected, or re-connected.
    navigator.hid.addEventListener('connect', async (event) => {
      const connected = await this.connect();
      if (connected) {
        this.#dispatchEvent(event);
      }
    });

    // Handle behaviour if a device is disconnected.
    navigator.hid.addEventListener('disconnect', async (event) => {
      if (event.device === this.#device) {
        await this.disconnect();
        this.#dispatchEvent(event);
      }
    });

    // Reset the device when the page navigates away.
    window.addEventListener('beforeunload', () => {
      if (this.#device) {
        // await this.reset();
        return this.reset();
      }
    });
  }

  /**
   * Reports whether WebHID is supported.
   *
   * @return {boolean}
   */
  get isSupported() {
    return this.#isSupported;
  }

  /**
   * Reports whther the StreamDeck is conected & open.
   *
   * @return {boolean}
   */
  get isConnected() {
    return this.#device?.opened ? true : false;
  }

  /**
   * Connect to a StreamDeck device.
   *
   * @fires StreamDeck#connect Notifies listeners we're now connected.
   *
   * @param {boolean} showPicker Show the picker if no device is found.
   * @return {Promise<boolean>} Successfully connected.
   */
  async connect(showPicker) {
    if (!this.#isSupported) {
      throw new Error('Not supported.');
    }
    this.#device = await this.#getDevice(showPicker);
    if (!this.#device) {
      return false;
    }
    switch (this.#device.productId) {
      case StreamDeckMini.PRODUCT_ID:
        this.#deviceType = new StreamDeckMini();
        break;
      case StreamDeckV2.PRODUCT_ID:
        this.#deviceType = new StreamDeckV2();
        break;
      default:
        console.warn("StreamDeck product ID", this.#device.productId, "is not tested");
        this.#deviceType = new StreamDeckV2();
        break;
    }
    if (this.#device.opened) {
      return true;
    }
    // Open and reset the device.
    await this.#device.open();

    // Initialize the KeyState oobject
    this.#keyState = new Array(this.#deviceType.NUM_KEYS).fill(false);

    // Add event listener for key presses.
    this.#device.addEventListener('inputreport', (event) => {
      if (event.reportId === 0x01) {
        this.#onButtonPushed(event.data.buffer);
      }
    });

    return true;
  }

  /**
   * Disconnect from a StreamDeck device.
   *
   * @fires StreamDeck#disconnect Notifies listeners we're no longer connected.
   */
  async disconnect() {
    if (!this.#device) {
      return;
    }

    await this.#device.close();
    this.#device = null;
  }

  /**
   * Get the button Id (key number) for a button name.
   * @param {string} name The name of the button.
   * @return {number} The number of the button.
   */
  buttonNameToId(name) {
    return this.#deviceType.buttonNameToIdMap[name];
  }

  /**
   * Get a StreamDeck device.
   * @param {boolean} showPicker Show the picker if no device is found.
   * @return {Promise<HIDDevice>} StreamDeck HID device.
   */
  async #getDevice(showPicker) {
    const previousDevice = await this.#getPreviousDevice();
    if (previousDevice) {
      return previousDevice;
    }
    if (showPicker) {
      const opts = {filters: [
        {vendorId: 0x0fd9, productId: 0x0060},  // Original
        {vendorId: 0x0fd9, productId: StreamDeckMini.PRODUCT_ID},  // Mini
        {vendorId: 0x0fd9, productId: 0x006c},  // XL
        {vendorId: 0x0fd9, productId: StreamDeckV2.PRODUCT_ID}  // V2
      ]};
      const devices = await navigator.hid.requestDevice(opts);
      return devices[0];
    }
    return null;
  }

  /**
   * Gets a previously connected StreamDeck device.
   *
   * @return {Promise<HIDDevice>} StreamDeck HID device.
   */
  async #getPreviousDevice() {
    const devices = await navigator.hid.getDevices();
    for (const device of devices) {
      if (device.vendorId === 0x0fd9) {
        if (device.productId === 0x0060 ||
            device.productId === StreamDeckMini.PRODUCT_ID ||
            device.productId === 0x006c ||
            device.productId === StreamDeckV2.PRODUCT_ID) {
          return device;
        }
      }
    }
    return null;
  }

  /**
   * Called when a button on the StreamDeck is pushed/released.
   *
   * @fires StreamDeck#keydown
   * @fires StreamDeck#keyup
   *
   * @param {ArrayBuffer} buffer
   */
  #onButtonPushed(buffer) {
    const keys = new Int8Array(buffer);
    const start = this.#deviceType.OFFSET - 1;
    const end = this.#deviceType.NUM_KEYS + this.#deviceType.OFFSET - 1;
    const data = Array.from(keys).slice(start, end);
    data.forEach((item, keyIndex) => {
      const keyPressed = data[keyIndex] === 1;
      const stateChanged = keyPressed !== this.#keyState[keyIndex];
      if (!stateChanged) {
        return;
      }
      this.#keyState[keyIndex] = keyPressed;
      const details = {
        buttonId: keyIndex + this.#deviceType.ID_OFFSET,
        pushed: keyPressed,
        buttonStates: this.#keyState.slice(),
      };
      const evtType = keyPressed ? 'keydown' : 'keyup';
      this.#dispatchCustomEvent(evtType, details);
    });
  }

  /**
   * Set the brightness of the StreamDeck panel.
   *
   * @param {number} percentage 1-100
   * @return {?Promise<ArrayBuffer>}
   */
  setBrightness(percentage) {
    this.#readyOrThrow();
    return this.#deviceType.setBrightness(this.#device, percentage);
  }

  /**
   * Gets the device name.
   *
   * @return {?string} Device name.
   */
  getDeviceName() {
    this.#readyOrThrow();
    return this.#device.productName;
  }

  /**
   * Get the serial number of the connected device.
   *
   * @return {?Promise<string>} Serial number.
   */
  async getSerialNumber() {
    this.#readyOrThrow();
    const dv = await this.#device.receiveFeatureReport(6, 32);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(dv.buffer.slice(2));
  }

  /**
   * Get the firmware revision of the connected StreamDeck.
   *
   * @return {?Promise<string>} Firmware version.
   */
  async getFirmwareVersion() {
    this.#readyOrThrow();
    const dv = await this.#device.receiveFeatureReport(5, 32);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(dv.buffer.slice(6));
  }

  /**
   * Reset the StreamDeck device.
   *
   * @return {?Promise<ArrayBuffer>}
   */
  async reset() {
    this.#readyOrThrow();
    return this.#deviceType.reset(this.#device);
  }

  /**
   * Clears the button at buttonId
   *
   * @param {number} buttonId Key index
   */
  async clearButton(buttonId) {
    this.#readyOrThrow();
    return this.fillColor(buttonId, '#000000', true);
  }

  /**
   * Clear all keys on the attached device.
   */
  async clearAllButtons() {
    this.#readyOrThrow();
    const results = [];
    for (let i = 0; i < this.#deviceType.NUM_KEYS; i++) {
      results.push(this.fillColor(i, '#000000', true));
    }
    return Promise.all(results);
  }

  /**
   * Clears the image cache.
   */
  clearImageCache() {
    this.#imageCache = {};
  }

  /**
   * Fill the button at buttonId with the image at the specified URL.
   *
   * @param {number} buttonId Key index
   * @param {string} url URL to image
   * @param {boolean} [cache] Cache/use cached image if available.
   */
  async fillURL(buttonId, url, cache) {
    this.#readyOrThrow();
    if (cache && this.#imageCache[url]) {
      return this.#sendBuffer(buttonId, this.#imageCache[url]);
    }
    const buffer = await this.#getImageBufferFromURL(url);
    const result = this.#sendBuffer(buttonId, buffer);
    if (cache) {
      this.#imageCache[url] = buffer;
    }
    return result;
  }

  /**
   * Fill the button at buttonId with the specified color.
   *
   * @param {number} buttonId Key index
   * @param {string} color Color to fill the image with (hex, or named)
   * @param {boolean} [cache] Cache/use cached image if available.
   */
  async fillColor(buttonId, color, cache) {
    this.#readyOrThrow();
    if (cache && this.#imageCache[color]) {
      return this.#sendBuffer(buttonId, this.#imageCache[color]);
    }
    const canvas = new OffscreenCanvas(this.#deviceType.ICON_SIZE, this.#deviceType.ICON_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.#deviceType.ICON_SIZE, this.#deviceType.ICON_SIZE);
    const buffer = await this.#getImageBufferFromCanvas(canvas);
    const result = this.#sendBuffer(buttonId, buffer);
    if (cache) {
      this.#imageCache[color] = buffer;
    }
    return result;
  }

  /**
   * Fill the button at buttonId with the image in the canvas.
   *
   * @param {number} buttonId Key index.
   * @param {HTMLCanvasElement} canvas Canvas (72x72px) element to use.
   */
  async fillCanvas(buttonId, canvas) {
    this.#readyOrThrow();
    const buffer = await this.#getImageBufferFromCanvas(canvas);
    return this.#sendBuffer(buttonId, buffer);
  }

  /**
   * Fill the button at buttonId with the image in the array buffer.
   *
   * @param {number} buttonId Key index.
   * @param {ArrayBuffer} buffer Image buffer.
   */
  async fillBuffer(buttonId, buffer) {
    this.#readyOrThrow();
    return this.#sendBuffer(buttonId, buffer);
  }

  /**
   * Generate an image buffer from the supplied canvas.
   *
   * @param {Canvas} canvas Canvas element to use, should be 72px x 72px
   * @return {Promise<ArrayBuffer>}
   */
  async #getImageBufferFromCanvas(canvas) {
    return this.#deviceType.getImageBufferFromCanvas(canvas);
  }

  /**
   * Generate an image buffer from the specified URL.
   *
   * @param {string} url
   * @return {Promise<ArrayBuffer>}
   */
  async #getImageBufferFromURL(url) {
    const img = await this.#loadImageFromURL(url);
    const imgWidth = img.width;
    const imgHeight = img.height;
    const canvas = new OffscreenCanvas(this.#deviceType.ICON_SIZE, this.#deviceType.ICON_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.translate(this.#deviceType.ICON_SIZE_HALF, this.#deviceType.ICON_SIZE_HALF);
    ctx.rotate(this.#deviceType.IMAGE_ROTATION * Math.PI / 180);
    ctx.translate(this.#deviceType.ICON_SIZE_HALF * -1, this.#deviceType.ICON_SIZE_HALF * -1);
    ctx.drawImage(img,
        0, 0, imgWidth, imgHeight,
        0, 0, this.#deviceType.ICON_SIZE, this.#deviceType.ICON_SIZE);
    return this.#getImageBufferFromCanvas(canvas);
  }

  /**
   * Loads the specified image from the network.
   *
   * @param {string} url
   * @return {Promise<Image>}
   */
  async #loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.error = function(err) {
        reject(err);
      };
      img.onload = function() {
        resolve(img);
      };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  /**
   * Draws an image on the specified button.
   *
   * @param {number} buttonId Button ID to draw the image on
   * @param {ArrayBuffer} buffer Image buffer, generated by getImageBufferFromX
   */
  #sendBuffer(buttonId, buffer) {
    const packets = this.#getPacketsFromBuffer(buttonId, buffer);
    this.#addPacketsToSendQueue(packets);
  }

  /**
   * Generates the packets to needed to draw the image on the specified button.
   *
   * @param {number} buttonId Button ID to draw the image on.
   * @param {ArrayBuffer} buffer Image buffer.
   * @return {!array}
   */
  #getPacketsFromBuffer(buttonId, buffer) {
    return this.#deviceType.getPacketsFromBuffer(buttonId, buffer);
  }

  /**
   * Queues the packets and sends them in order.
   *
   * @param {Array} packets Array of packets to send to device.
   */
  async #addPacketsToSendQueue(packets) {
    this.#readyOrThrow();
    this.#commandQueue.push(packets);
    if (this.#isQueueRunning) {
      return;
    }
    this.#isQueueRunning = true;
    let queued = this.#commandQueue.shift();
    while (queued) {
      for (const packet of queued) {
        const reportId = packet[0];
        const data = new Uint8Array(packet.slice(1));
        await this.#device.sendReport(reportId, data);
      }
      queued = this.#commandQueue.shift();
    }
    this.#isQueueRunning = false;
  }

  /**
   * Checks if the StreamDeck is connected and ready.
   *
   * @throws {Error} Error if not open and ready.
   * @return {!boolean} True if StreamDeck is open and ready.
   */
  #readyOrThrow() {
    if (!this.#device?.opened) {
      const err = new Error('Not connected.');
      err.name = 'StreamDeck';
      throw err;
    }
    return true;
  }

  /*
   * Event Handlers - implemented since events aren't available.
   */
  #handlers = [];

  /**
   * Adds an event handler for a specific event type.
   *
   * @param {string} type Event type
   * @param {Function} fn Function to call when even type matches
   */
  addEventListener(type, fn) {
    this.#handlers.push({type, fn});
  }

  /**
   * Removes an event handler for a specific event type.
   *
   * @param {string} type Event type
   * @param {Function} fn Function to call when even type matches
   */
  removeEventListener(type, fn) {
    this.#handlers = this.#handlers.filter((item) => {
      if (item.type !== type) {
        return true;
      }
      if (item.fn !== fn) {
        return true;
      }
    });
  }

  /**
   * Dispatch a new custom event.
   *
   * @param {string} type Type of event to dispatch.
   * @param {Object} data Data to add to the details of the event.
   */
  #dispatchCustomEvent(type, data) {
    const detail = data ? {detail: data} : null;
    this.#handlers.forEach((handler) => {
      if (type === handler.type && handler.fn) {
        handler.fn(new CustomEvent(type, detail));
      }
    });
  }

  /**
   * Dispatch a existing event.
   *
   * @param {Event} event The event to dispatch
   */
   #dispatchEvent(event) {
     this.#handlers.forEach((handler) => {
       if (event.type === handler.type && handler.fn) {
         handler.fn(event);
       }
     });
   }
}
