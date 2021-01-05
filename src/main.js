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
