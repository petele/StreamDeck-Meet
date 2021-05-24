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

'use strict';

/* global MeetWrapper, StreamDeck, HueLights */

const hueLights = new HueLights();
const streamDeck = new StreamDeck();
const sdConnectButtonID = 'streamDeckHelperConnect';


/**
 * Adds a Connect to StreamDeck button to the page.
 */
function addConnectButton() {
  if (window.location.pathname !== '/') {
    return;
  }
  const elem = document.createElement('button');
  elem.id = sdConnectButtonID;
  elem.type = 'button';
  elem.innerText = 'Connect StreamDeck';
  elem.style = 'position: absolute;top: 100px;left:100px;z-index:100';
  elem.addEventListener('click', async () => {
    elem.remove();
    await streamDeck.connect(true);
    startWrapper();
  });
  document.body.appendChild(elem);
}

/**
 * Check if the StreamDeck is open, and start the Meet Helper, otherwise
 * show the connect button.
 *
 * @return {boolean} True if the StreamDeck is connected.
 */
function startWrapper() {
  if (streamDeck.isConnected) {
    const elem = document.getElementById(sdConnectButtonID);
    if (elem) {
      elem.remove();
    }
    new MeetWrapper(streamDeck, hueLights);
    return true;
  }
  addConnectButton();
  return false;
}

/**
 * Initialization, attempts to open the StreamDeck and then the Meet Wrapper.
 */
async function go() {
  if (window.location.pathname.startsWith('/linkredirect')) {
    return;
  }
  await streamDeck.connect();
  if (startWrapper()) {
    return;
  }
  streamDeck.addEventListener('connect', () => {
    startWrapper();
  });
}

go();
