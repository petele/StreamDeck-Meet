/*
 * Copyright 2021 Google LLC
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
 * @module MacropadGB4
 */
class MacropadGB4 { // eslint-disable-line
  // eslint-disable-next-line max-len
  // https://github.com/JackPikatea/vial-qmk/blob/vial/keyboards/pikatea/pikatea_macropad_gb4/config.h
  static PRODUCT_ID = 0x001B;

  // We only have 63 to 7 buttons in the Macropad, so a lot of
  // buttons don't get displayed (-1).
  buttonNameToIdMap = {
    // All rooms
    'light-off': -1,
    'light-on': -1,

    // Lobby
    'start-instant': -1,
    'start-next': -1,

    // Green Room
    'cam': 2,
    'cam-disabled': 2,
    'enter-meeting': -1,
    'mic': 1,
    'mic-disabled': 1,

    // Meeting
    // cam, cam-disabled
    'cc': -1,
    'cc-on': -1,
    'chat': -1,
    'chat-open': -1,
    'end-call': -1,
    'hand': 3,
    'hand-raised': 3,
    // mic, mic-disabled
    'present-stop': -1,
    'blank': -1,
    'users': -1,
    'users-open': -1,

    // Exit Hall
    'home': -1,
    'rejoin': -1,
  };

  // Macropad input report values to keyIndex
  keyValueToIdMap = {
    182: 1,
    205: 2,
    181: 3,
  }

  OFFSET = 0;
  ID_OFFSET = 0;
  // eslint-disable-next-line max-len
  NUM_KEYS = 7; // The 3-key, 5-key, and 7-key hardware all expose themselves as 7 key. https://docs.pikatea.com/PikateaMacropadGB4/#programming-and-usage
  ICON_SIZE = 0;
  ICON_SIZE_HALF = this.ICON_SIZE / 2;
  IMAGE_ROTATION = -90;
  HRZFLIP = 0;

  // #PACKET_SIZE = 1024;
  // #PACKET_HEADER_LENGTH = 16;
  // #MAX_PAYLOAD_LENGTH = this.#PACKET_SIZE - this.#PACKET_HEADER_LENGTH;


  /**
   * Constructor
   */
  constructor() {
  }

  /**
   * Set the brightness of the macropad panel.
   *
   * @param {object} device macropad device object
   * @param {number} percentage 1-100
   * @return {?Promise<ArrayBuffer>}
   */
  setBrightness(device, percentage) {
    // TODO figure this out
    // const data = new Uint8Array([0x08, percentage]);
    // return device.sendFeatureReport(0x03, data);
  }

  /**
   * Reset the macropad device.
   *
   * @param {object} device macropad device object
   * @return {?Promise<ArrayBuffer>}
   */
  async reset(device) {
    // No reset needed (I think)
  }

  /**
   * Generate an image buffer from the supplied canvas.
   *
   * @param {Canvas} canvas Canvas element to use, should be 72px x 72px
   * @return {Promise<ArrayBuffer>}
   */
  async getImageBufferFromCanvas(canvas) {
    return new ArrayBuffer();
  }

  /**
   * Generates the packets to needed to draw the image on the specified button.
   *
   * @param {number} buttonId Button ID to draw the image on.
   * @param {ArrayBuffer} buffer Image buffer.
   * @return {!array}
   */
  getPacketsFromBuffer(buttonId, buffer) {
    return [];
  }
}
