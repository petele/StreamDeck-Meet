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

/* Packets/Header logic for V1 Stream Deck from https://github.com/Julusian/node-elgato-stream-deck */

/* eslint-disable no-invalid-this */

'use strict';

/**
 *
 * @module StreamDeckV1
 */
class StreamDeckV1 { // eslint-disable-line
  static PRODUCT_ID = 0x0060;

  buttonNameToIdMap = {
    // All rooms
    'light-on': 3,
    'light-off': 2,
    'fullscreen-on': 5,
    'fullscreen-off': 5,
    'fullscreen-disabled': 5,

    // Lobby
    'start-next': 15,
    'start-instant': 14,

    // Green Room
    'enter-meeting': 1,
    'mic': 15,
    'mic-disabled': 15,
    'cam': 14,
    'cam-disabled': 14,

    // Meeting
    // cam, cam-disabled
    'info': 1, 
    'info-open': 1, 
    'users': 9,
    'users-open': 9,
    'chat': 8,
    'chat-open': 8,
    'activities': 7,
    'activities-open': 7,
    'present-stop': 6,
    'blank': 6,
    'cc': 13,
    'cc-on': 13,
    'hand': 12,
    'hand-raised': 12,
    'end-call': 11,

    // Exit Hall
    'home': 11,
    'rejoin': 15,
  };

  OFFSET = 1;
  ID_OFFSET = 1;
  NUM_KEYS = 15;
  ICON_SIZE = 72;
  ICON_SIZE_HALF = this.ICON_SIZE / 2;
  IMAGE_ROTATION = 0;
  HRZFLIP = 1;

  #PACKET_SIZE = 8191;
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
    //console.log('getImageBufferFromCanvas');
    const blob = CanvasToBMP.toBlob(canvas, false, false);

    const buff = await blob.arrayBuffer();

    return buff;
  }

    /**
   * Build packet header
   *
   * @param {ArrayBuffer} header Header buffer
   * @param {number} partIndex (which part of the two packets for V1 Stream Deck)
   * @param {number} isLast Is last packet (V1 Stream Deck uses two packets per buffer)
   * @param {number} buttonId Button ID to draw the image on.
   */
  buildHeader(header, partIndex, isLast, buttonId) { 
    new DataView(header).setUint8(0, 0x02); // report ID
    new DataView(header).setUint8(1, 0x01); // always 1 - set the icon
    new DataView(header).setUint16(2, partIndex, true);
    new DataView(header).setUint8(4, isLast);
    new DataView(header).setUint8(5, buttonId); // button
  }

  /**
   * Generates the packets to needed to draw the image on the specified button.
   *
   * @param {number} buttonId Button ID to draw the image on.
   * @param {ArrayBuffer} buffer Image buffer.
   * @return {!array}
   */
  getPacketsFromBuffer(buttonId, buffer) {

    const packetBytes = buffer.byteLength / 2;

    const header1 = new ArrayBuffer(this.#PACKET_HEADER_LENGTH);
    this.buildHeader(header1, 0x01, 0x0, buttonId);

    const packet1 = new Uint8Array(this.#PACKET_SIZE);
    packet1.set(new Uint8Array(header1));
    packet1.set(new Uint8Array(buffer.slice(0,packetBytes)), this.#PACKET_HEADER_LENGTH);

    const header2 = new ArrayBuffer(this.#PACKET_HEADER_LENGTH);
    this.buildHeader(header2, 0x02, 0x1, buttonId);

    const packet2 = new Uint8Array(this.#PACKET_SIZE);
    packet2.set(new Uint8Array(header2));
    packet2.set(new Uint8Array(buffer.slice(packetBytes,buffer.byteLength)), this.#PACKET_HEADER_LENGTH);

    return [packet1, packet2];
  }
}
