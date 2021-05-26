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
 * @module HueLights
 */
class HueLights { // eslint-disable-line
  #hubAddress;
  #apiKey;
  #lightId;
  #autoLights = false;
  #ready = false;

  /**
   *
   */
  constructor() {
    try {
      const hueConfig = JSON.parse(localStorage['msdHue']);
      this.#hubAddress = hueConfig.address;
      this.#apiKey = hueConfig.apiKey;
      this.#lightId = hueConfig.lightId;
      this.#autoLights = hueConfig.autoOn ? true : false;
      if (this.#hubAddress && this.#apiKey && this.#lightId) {
        this.#ready = true;
        return;
      }
    } catch (ex) {
      // Do nothing.
    }
  }

  /**
   * Reports whether the Hue Lights API is available.
   *
   * @return {boolean}
   */
  get isAvailable() {
    return this.#ready;
  }


  /**
   * The lights should be turned on/off automatically.
   *
   * @return {boolean}
   */
  get auto() {
    return this.#autoLights;
  }

  /**
   * Turn the Hue light on or off
   *
   * @param {boolean} on Light state
   */
  async on(on) {
    if (!this.#ready) {
      return;
    }
    const address = this.#hubAddress;
    const key = this.#apiKey;
    const lightId = this.#lightId;
    const url = `https://${address}/api/${key}/lights/${lightId}/state`;
    const hueCmd = on ? {on: true, ct: 250, bri: 100} : {on: false};
    const fetchOpts = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(hueCmd),
    };
    try {
      await fetch(url, fetchOpts);
    } catch (ex) {
      console.error('Unable to toggle Hue light.', ex);
    }
  }
}
