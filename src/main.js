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

/* global MeetWrapper, StreamDeck */

console.warn('*SD-Meet* main.js loaded');

const streamDeck = new StreamDeck();
const sdConnectButtonID = 'streamDeckHelperConnect';


let observer = null;


/**
 * Adds a Connect to StreamDeck button to the page.
 */
function addConnectButton() {
  if (window.location.pathname.startsWith('/linkredirect')) {
    return;
  }
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', addConnectButton);
    return;
  }
  if (document.getElementById(sdConnectButtonID)) {
    return;
  }

  // Inject styles if not present
  const styleId = 'streamDeckHelperStyles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #streamDeckHelperConnect {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        padding: 12px 20px;
        background: rgba(18, 18, 18, 0.85);
        backdrop-filter: blur(12px) saturate(180%);
        -webkit-backdrop-filter: blur(12px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        color: #f5f5f7;
        font-family: -apple-system, sans-serif;
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25);
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        display: flex;
        align-items: center;
        gap: 8px;
        letter-spacing: -0.1px;
      }
      #streamDeckHelperConnect:hover {
        background: rgba(28, 28, 30, 0.9);
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.35);
        transform: translateY(-2px);
      }
      #streamDeckHelperConnect:active {
        transform: translateY(0);
      }
      #streamDeckHelperConnect svg {
        stroke: #30d158;
        transition: stroke 0.3s ease;
      }
      #streamDeckHelperConnect:hover svg {
        stroke: #34c759;
      }
    `;
    document.head.appendChild(style);
  }

  const elem = document.createElement('button');
  elem.id = sdConnectButtonID;
  elem.type = 'button';
  elem.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round">
       <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
       <rect x="7" y="7" width="3" height="3"/>
       <rect x="14" y="7" width="3" height="3"/>
       <rect x="7" y="14" width="3" height="3"/>
       <rect x="14" y="14" width="3" height="3"/>
    </svg>
    Connect StreamDeck
  `;

  elem.addEventListener('click', async () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    elem.remove();
    try {
      await streamDeck.connect(true);
    } catch (err) {
      console.error('*SD-Meet* connection error during user click:', err);
    }
    startWrapper();
  });

  document.body.appendChild(elem);

  if (!observer) {
    observer = new MutationObserver(() => {
      if (window.location.pathname.startsWith('/linkredirect')) {
        const hasBtn = document.getElementById(sdConnectButtonID);
        if (hasBtn) {
          hasBtn.remove();
        }
        return;
      }
      const hasBtn = document.getElementById(sdConnectButtonID);
      if (!streamDeck.isConnected && !hasBtn) {
        addConnectButton();
      }
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
}

let activeWrapper = null;

/**
 * Check if the StreamDeck is open, and start the Meet Helper, otherwise
 * show the connect button.
 *
 * @return {boolean} True if the StreamDeck is connected.
 */
function startWrapper() {
  if (streamDeck.isConnected) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const elem = document.getElementById(sdConnectButtonID);
    if (elem) {
      elem.remove();
    }
    if (!activeWrapper) {
      activeWrapper = new MeetWrapper(streamDeck);
    }
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
  try {
    console.warn('*SD-Meet* calling streamDeck.connect()');
    await streamDeck.connect();
    console.warn('*SD-Meet* streamDeck.connect() completed');
  } catch (err) {
    console.error('*SD-Meet* connection error:', err);
  }
  if (startWrapper()) {
    return;
  }
  try {
    streamDeck.addEventListener('connect', () => {
      startWrapper();
    });
  } catch (err) {
    console.error('*SD-Meet* listener error:', err);
  }
}

go();
