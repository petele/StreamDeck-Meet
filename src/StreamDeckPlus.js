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
 * @module StreamDeckPlus
 */
class StreamDeckPlus { // eslint-disable-line
  static PRODUCT_ID = 0x0084;

  /*
    2 rows with 4 buttons, LCD screen, 4 dials/buttons
    Top Left Button =  0,
    Bottom Right Button = 7
  */

  buttonNameToIdMap = {
    // All rooms
    'fullscreen-on': -1,
    'fullscreen-off': -1,
    'fullscreen-disabled': -1,

    // Lobby
    'start-instant': 6,
    'start-next': 5,

    // Green Room
    'cam': 0,
    'cam-disabled': 0,
    'enter-meeting': 6,
    'mic': 7,
    'mic-disabled': 7,

    // Meeting
    'cc': 1,
    'cc-on': 1,
    'chat': 2,
    'chat-open': 2,
    'users': 3,
    'users-open': 3,
    'end-call': 4,
    'hand': 5,
    'hand-raised': 5,
    'reaction': 6,
    'reaction-open': 6,
    'present-stop': -1,
    'blank': -1,
    'info': -1,
    'info-open': -1,
    'activities': -1,
    'activities-open': -1,

    // Exit Hall
    'home': 1,
    'rejoin': 6,
  };

  OFFSET = 4;
  ID_OFFSET = 0;
  NUM_KEYS = 8;
  ICON_SIZE = 120;
  ICON_SIZE_HALF = this.ICON_SIZE / 2;
  IMAGE_ROTATION = 0;
  HRZFLIP = 0;

  #PACKET_SIZE = 1024;
  #PACKET_HEADER_LENGTH = 8;
  #MAX_PAYLOAD_LENGTH = this.#PACKET_SIZE - this.#PACKET_HEADER_LENGTH;

  /**
   * @type {Array<boolean>} Array of encoder states
   */
  #encoderState = new Array(this.NUM_ENCODERS).fill(false);

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

  get NUM_ENCODERS() {
		return 4
	}

	get LCD_STRIP_SIZE() {
		const size = this.LCD_ENCODER_SIZE
		size.width *= this.NUM_ENCODERS
		return size
	}
	get LCD_ENCODER_SIZE() {
		return { width: 200, height: 100 }; // The tap value returned is going up to 255 but the segment is 200px wide
	}

  // max encoder size is (255 * 3) + 27 (4th seg) - 6 (1st seg cutoff on left) = 786

	calculateEncoderForX(x) {
		return Math.floor(x / this.LCD_ENCODER_SIZE.width)
	}

  /**
   * 
   * @param {Uint8Array} data 
   */
  handleLcdInput(data) {
		const buffer = new DataView(data.buffer);
		const position = {
			x: buffer.getUint16(5),
			y: buffer.getUint16(7),
		}
    const segment = buffer.getUint8(6);
    console.log('x, y, Segment', position.x, position.y, segment, buffer.getUint8(5), buffer.getUint8(7));
		const index = this.calculateEncoderForX(position.x)

		switch (data[3]) {
			case 0x01: // short press
				console.log('lcdShortPress', index, position)
				break
			case 0x02: // long press
				console.log('lcdLongPress', index, position)
				break
			case 0x03: {
				// swipe
				const position2 = {
					x: buffer.getUint16(9),
					y: buffer.getUint16(11),
				}
				const index2 = this.calculateEncoderForX(position2.x)
				console.log('lcdSwipe', index, index2, position, position2)
				break
			}
		}
	}

  /**
   * 
   * @param {Uint8Array} data 
   */
	handleEncoderInput(data) {
		switch (data[3]) {
			case 0x00: // press/release
				for (let keyIndex = 0; keyIndex < this.NUM_ENCODERS; keyIndex++) {
					const keyPressed = Boolean(data[this.OFFSET + keyIndex])
					const stateChanged = keyPressed !== this.#encoderState[keyIndex]
					if (stateChanged) {
						this.#encoderState[keyIndex] = keyPressed
						if (keyPressed) {
							console.log('encoderDown', keyIndex)
						} else {
							console.log('encoderUp', keyIndex)
						}
					}
				}
				break
			case 0x01: // rotate
				for (let keyIndex = 0; keyIndex < this.NUM_ENCODERS; keyIndex++) {
					const intArray = new Int8Array(data.buffer, data.byteOffset, data.byteLength)
					const value = intArray[this.OFFSET + keyIndex]
					if (value > 0) {
						console.log('rotateRight', keyIndex, value)
					} else if (value < 0) {
						console.log('rotateLeft', keyIndex, -value)
					}
				}
				break
		}
	}

}
