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
 * @module StreamDeckXL
 */
class StreamDeckXL { // eslint-disable-line
  static PRODUCT_ID = 0x006c;

  /*
    4 rows with 8 buttons
    Top Left =  (unknown),
    Bottom Right = (unknown)
  */

  buttonNameToIdMap = {
    // All rooms
    'light-on': -1,
    'light-off': -1,
    'fullscreen-on': 5,
    'fullscreen-off': 5,
    'fullscreen-disabled': 5,

    // Lobby
    'start-next': 8,
    'start-instant': 9,

    // Green Room
    'enter-meeting': 8,
    'mic': 16,
    'mic-disabled': 16,
    'cam': 17,
    'cam-disabled': 17,

    // Meeting
    'reaction': 6,
    'reaction-open': 6,
    'info': 8,
    'info-open': 8,
    'users': 9,
    'users-open': 9,
    'chat': 10,
    'chat-open': 10,
    'activities': 11,
    'activities-open': 11,
    'present-stop': 12,
    'blank': 12,
    'cc': 18,
    'cc-on': 18,
    'hand': 19,
    'hand-raised': 19,
    'end-call': 20,

    // Exit Hall
    'home': 20,
    'rejoin': 16,
  };

  OFFSET = 4;
  ID_OFFSET = 0;
  NUM_KEYS = 32;
  ICON_SIZE = 96;
  ICON_SIZE_HALF = this.ICON_SIZE / 2;
  IMAGE_ROTATION = 180;
  HRZFLIP = 0;

  #PACKET_SIZE = 1024;
  #PACKET_HEADER_LENGTH = 8;
  #MAX_PAYLOAD_LENGTH = this.#PACKET_SIZE - this.#PACKET_HEADER_LENGTH;

  /**
   * Constructor
   */
  constructor() {
  }

  /**
   * Set the brightness of the StreamDeck panel.
   *
   * @param {object} device StreamDeck device object
   * @param {number} percentage 1-100
   * @return {?Promise<ArrayBuffer>}
   */
  setBrightness(device, percentage) {
    const data = new Uint8Array([0x08, percentage]);
    return device.sendFeatureReport(0x03, data);
  }

  /**
   * Reset the StreamDeck device.
   *
   * @param {object} device StreamDeck device object
   * @return {?Promise<ArrayBuffer>}
   */
  async reset(device) {
    const data = new Uint8Array([0x02]);
    return device.sendFeatureReport(0x03, data);
  }

  /**
   * Generate an image buffer from the supplied canvas.
   *
   * @param {Canvas} canvas Canvas element to use, should be 72px x 72px
   * @return {Promise<ArrayBuffer>}
   */
  async getImageBufferFromCanvas(canvas) {
    const blob = await canvas.convertToBlob({type: 'image/jpeg', quality: 1.0});
    const buff = await blob.arrayBuffer();
    return buff;
  }

  /**
   * Generates the packets to needed to draw the image on the specified button.
   *
   * @param {number} buttonId Button ID to draw the image on.
   * @param {ArrayBuffer} buffer Image buffer.
   * @return {!array}
   */
  getPacketsFromBuffer(buttonId, buffer) {
    const packets = [];

    let page = 0;
    let start = 0;
    let bytesRemaining = buffer.byteLength;

    while (bytesRemaining > 0) {
      const byteCount = Math.min(bytesRemaining, this.#MAX_PAYLOAD_LENGTH);
      const isLastPacket = bytesRemaining <= this.#MAX_PAYLOAD_LENGTH;
      const header = new ArrayBuffer(this.#PACKET_HEADER_LENGTH);

      new DataView(header).setUint8(0, 0x02); // report ID
      new DataView(header).setUint8(1, 0x07); // always 7 - set the icon
      new DataView(header).setUint8(2, buttonId); // button
      new DataView(header).setUint8(3, isLastPacket ? 1 : 0); // is last packet
      new DataView(header).setUint16(4, byteCount, true);
      new DataView(header).setUint16(6, page++, true);

      const end = start + byteCount;
      const packet = new Uint8Array(this.#PACKET_SIZE);
      packet.set(new Uint8Array(header));
      packet.set(
          new Uint8Array(buffer.slice(start, end)),
          this.#PACKET_HEADER_LENGTH,
      );

      start = end;
      bytesRemaining = bytesRemaining - byteCount;

      packets.push(packet);
    }
    return packets;
  }
}
