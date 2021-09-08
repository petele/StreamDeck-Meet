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
 * @module StreamDeckMini
 */
class StreamDeckMini { // eslint-disable-line
  static PRODUCT_ID = 0x0063;

  // We only have 6 buttons in the Mini, so a lot of
  // buttons don't get displayed (-1).
  buttonNameToIdMap = {
    // All rooms
    'light-off': -1,
    'light-on': -1,

    // Lobby
    'start-instant': 6,
    'start-next': 5,

    // Green Room
    'cam': 1,
    'cam-disabled': 1,
    'enter-meeting': 6,
    'mic': 4,
    'mic-disabled': 4,

    // Meeting
    // cam, cam-disabled
    'cc': 6,
    'cc-on': 6,
    'chat': 3,
    'chat-open': 3,
    'end-call': -1,
    'fellow': -1,
    'fellow-open': -1,
    'hand': 5,
    'hand-raised': 5,
    // mic, mic-disabled
    'present-stop': -1,
    'blank': -1,
    'users': 2,
    'users-open': 2,

    // Exit Hall
    'home': 1,
    'rejoin': 6,
  };

  OFFSET = 1;
  ID_OFFSET = 1;
  NUM_KEYS = 6;
  ICON_SIZE = 80;
  ICON_SIZE_HALF = this.ICON_SIZE / 2;
  IMAGE_ROTATION = -90;

  #PACKET_SIZE = 1024;
  #PACKET_HEADER_LENGTH = 16;
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
    const arr = [0x63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const data = new Uint8Array(arr);
    return device.sendFeatureReport(0x0b, data);
  }

  /**
   * Generate an image buffer from the supplied canvas.
   *
   * @param {Canvas} canvas Canvas element to use, should be 72px x 72px
   * @return {Promise<ArrayBuffer>}
   */
  async getImageBufferFromCanvas(canvas) {
    const blob = CanvasToBMP.toBlob(canvas, false, false);

    const buff = await blob.arrayBuffer();

    /*
    // For debugging, write out a file
    const directoryHandle = await window.showDirectoryPicker();
    const opts = {create: true};
    const fileHandle = await directoryHandle.getFileHandle('temp.bmp', opts);
    const writable = await fileHandle.createWritable();
    await writable.write({type: 'write', data: buff});
    await writable.close();
    */

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
      new DataView(header).setUint8(1, 0x01); // always 1 - set the icon
      new DataView(header).setUint16(2, page++, true);
      new DataView(header).setUint8(4, isLastPacket ? 1 : 0); // is last packet
      new DataView(header).setUint8(5, buttonId); // button
      // leave the rest zero

      const end = start + byteCount;
      const packet = new Uint8Array(this.#PACKET_SIZE);
      packet.set(new Uint8Array(header));
      packet.set(
          new Uint8Array(buffer.slice(start, end)),
          this.#PACKET_HEADER_LENGTH);

      start = end;
      bytesRemaining = bytesRemaining - byteCount;

      packets.push(packet);
    }
    return packets;
  }
}
