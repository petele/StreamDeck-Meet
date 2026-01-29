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

class MeetWrapper { // eslint-disable-line
  #currentRoom;
  #hasBeenActivated = false;
  #inEmojiMode = false;

  #ROOM_NAMES = {
    lobby: 'lobby',
    greenRoom: 'greenRoom',
    meeting: 'meeting',
    exitHall: 'exitHall',
  };

  #streamDeck;

  /**
   * Constructor
   *
   * @param {HIDDevice} streamDeck
   */
  constructor(streamDeck) {
    this.#streamDeck = streamDeck;
    this.#streamDeck.addEventListener('keydown', (evt) => {
      this.#handleStreamDeckPress(evt.detail.buttonId);
    });

    window.addEventListener('fullscreenchange', () => {
      this.#drawFullScreenButton();
    });

    window.addEventListener('click', () => {
      if (this.#hasBeenActivated || !navigator.userActivation.isActive) {
        return;
      }
      this.#hasBeenActivated = true;
      this.#drawFullScreenButton();
    });

    // Watch for room changes
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname === '/landing') {
      this.#enterLobby();
      return;
    }

    const bodyObserver = new MutationObserver(() => {
      if (document.querySelector('div[data-meeting-title]')) {
        this.#enterMeeting();
      } else if (document.querySelector('[jscontroller=dyDNGc]')) {
        this.#enterGreenRoom();
      } else if (document.querySelector('[jsname=r4nke]')) {
        this.#enterExitHall();
      }
    });
    bodyObserver.observe(document.body, {attributes: true, childList: true});
  }


  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Methods for setting up the rooms.
   *
   */

  /**
   * Set up buttons for the lobby.
   */
  #enterLobby() {
    if (this.#currentRoom === this.#ROOM_NAMES.lobby) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.lobby;
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`start-next`);
    this.#drawButton(`start-instant`);
  }

  /**
   * Set up buttons for the green room.
   */
  #enterGreenRoom() {
    if (this.#currentRoom === this.#ROOM_NAMES.greenRoom) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.greenRoom;
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`enter-meeting`);
    this.#drawButton(`home`);

    // The timeout is there to make sure the elements have drawn on
    // screen. I should probably use a mutation observer to see when they
    // drawn, then render them, but I'm feeling kinda lazy today.
    setTimeout(() => {
      this.#setupGreenRoomMicButton();
      this.#setupGreenRoomCamButton();
    }, 500);
  }

  /**
   * Set up buttons for the meeting room.
   */
  #enterMeeting() {
    if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.meeting;
    // Only reset emoji mode if we are legitimately entering;
    // though the guard above handles most cases.
    this.#inEmojiMode = false;
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`end-call`);

    // The timeout is there to make sure the elements have drawn on
    // screen. I should probably use a mutation observer to see when they
    // drawn, then render them, but I'm feeling kinda lazy today.
    setTimeout(() => {
      this.#drawMeetingButtons();
    }, 500);

    // If it was an instant meeting, automatically close
    // the info dialog after 10 seconds.
    setTimeout(() => {
      this.#tapCloseInfoDialog();
    }, 10 * 1000);
  }

  /**
   * Draw standard meeting buttons.
   */
  #drawMeetingButtons() {
    if (this.#inEmojiMode) return;
    this.#setupMicButton();
    this.#setupCamButton();
    this.#setupCCButton();
    this.#setupHandButton();
    this.#setupInfoButton();
    this.#setupPeopleButton();
    this.#setupChatButton();
    this.#setupActivitiesButton();
    this.#setupPresentingButton();
    this.#setupReactionButton();
  }

  /**
   * Set up buttons for the exit hall.
   */
  #enterExitHall() {
    if (this.#currentRoom === this.#ROOM_NAMES.exitHall) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.exitHall;
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`rejoin`);
    this.#drawButton(`home`);
  }


  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Methods for interacting with the Stream Deck.
   *
   */

  /**
   * Handle called when a button is pressed.
   *
   * @param {number} buttonId Button ID of the button that was pressed.
   */
  #handleStreamDeckPress(buttonId) {
    console.log('*SD-Meet*', 'Button Pressed', buttonId);

    // Toggle full screen, used in all rooms.
    if (buttonId === this.#streamDeck.buttonNameToId('fullscreen-on')) {
      this.#toggleFullScreen();
      return;
    }

    // Available while in the lobby.
    if (this.#currentRoom === this.#ROOM_NAMES.lobby) {
      if (buttonId === this.#streamDeck.buttonNameToId('start-next')) {
        this.#tapStartNextMeeting();
      } else if (buttonId === this.#streamDeck.buttonNameToId('start-instant')) { // eslint-disable-line
        this.#tapStartInstantMeeting();
      }
      return;
    }

    // Available while in the green room.
    if (this.#currentRoom === this.#ROOM_NAMES.greenRoom) {
      if (buttonId === this.#streamDeck.buttonNameToId('enter-meeting')) {
        this.#tapEnterMeeting();
      } else if (buttonId === this.#streamDeck.buttonNameToId('mic')) {
        this.#tapGreenRoomMic();
      } else if (buttonId === this.#streamDeck.buttonNameToId('cam')) {
        this.#tapGreenRoomCam();
      } else if (buttonId === this.#streamDeck.buttonNameToId('home')) {
        this.#resetButtons();
        window.history.back();
      }
      return;
    }

    // Available while in the meeting room.
    if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      if (this.#inEmojiMode) {
        if (buttonId === this.#streamDeck.buttonNameToId('reaction')) {
          this.#exitEmojiMode();
          // Toggle the panel closed as well
          this.#tapReactions();
        } else {
          // It's an emoji click
          this.#handleEmojiPress(buttonId);
        }
        return;
      }

      if (buttonId === this.#streamDeck.buttonNameToId('reaction')) {
        this.#tapReactions();
        this.#inEmojiMode = true;
        // Wait for panel to open and draw (with retry)
        this.#drawEmojiButtons();

        // Start watching for panel closure
        this.#watchEmojiPanel();
      } else if (buttonId === this.#streamDeck.buttonNameToId('info')) {
        this.#tapInfo();
      } else if (buttonId === this.#streamDeck.buttonNameToId('users')) {
        this.#tapUsers();
      } else if (buttonId === this.#streamDeck.buttonNameToId('chat')) {
        this.#tapChat();
      } else if (buttonId === this.#streamDeck.buttonNameToId('activities')) {
        this.#tapActivities();
      } else if (buttonId === this.#streamDeck.buttonNameToId('present-stop')) {
        this.#tapStopPresenting();
      } else if (buttonId === this.#streamDeck.buttonNameToId('mic')) {
        this.#tapMic();
      } else if (buttonId === this.#streamDeck.buttonNameToId('cam')) {
        this.#tapCam();
      } else if (buttonId === this.#streamDeck.buttonNameToId('hand')) {
        this.#tapHand();
      } else if (buttonId === this.#streamDeck.buttonNameToId('cc')) {
        this.#tapCC();
      } else if (buttonId === this.#streamDeck.buttonNameToId('end-call')) {
        this.#tapHangUp();
      }
      return;
    }

    // Available while in the exit hall.
    if (this.#currentRoom === this.#ROOM_NAMES.exitHall) {
      if (buttonId === this.#streamDeck.buttonNameToId('rejoin')) {
        this.#tapRejoin();
      } else if (buttonId === this.#streamDeck.buttonNameToId('home')) {
        this.#tapHome();
      }
      return;
    }
  }

  /**
   * Draw an icon on the StreamDeck. Uses the current configuration to
   * determine which button to use based on the icon name.
   *
   * @param {string} iconName Name of icon to draw
   */
  #drawButton(iconName) {
    if (!this.#streamDeck?.isConnected) {
      return;
    }
    const buttonId = this.#streamDeck.buttonNameToId(iconName);
    if (buttonId === undefined || buttonId < 0) {
      console.warn('*SD-Meet*', `drawButton failed, unknown icon name: '${iconName}'`);
      return; // Not defined in the current configuration.
    }
    const iconURL = chrome.runtime.getURL(`ico-svg/${iconName}.svg`);
    this.#streamDeck.fillURL(buttonId, iconURL, true);
  }

  /**
   * Clear the StreamDeck
   */
  #resetButtons() {
    if (!this.#streamDeck?.isConnected) {
      return;
    }
    this.#streamDeck.clearAllButtons();
  }

  /**
   * Draw buttons for full screen toggle.
   */
  #drawFullScreenButton() {
    if (document.fullscreenElement) {
      this.#drawButton(`fullscreen-on`);
      return;
    }
    if (!navigator.userActivation.isActive) {
      this.#drawButton(`fullscreen-disabled`);
      return;
    }
    this.#drawButton(`fullscreen-off`);
  }


  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Set up mutation observers on the buttons in the meeting room.
   *
   */

  /**
   * Setup the meeting room mic button.
   */
  #setupMicButton() {
    const micButton = this.#getMicButton();
    if (!micButton) {
      return;
    }
    const micObserver = new MutationObserver(() => {
      this.#updateMicButton();
    });
    micObserver.observe(micButton, {attributeFilter: ['data-is-muted']});
    this.#updateMicButton();
  }

  /**
   * Setup the meeting room camera button.
   */
  #setupCamButton() {
    const camButton = this.#getCamButton();
    if (!camButton) {
      return;
    }
    const camObserver = new MutationObserver(() => {
      this.#updateCamButton();
    });
    camObserver.observe(camButton, {attributeFilter: ['data-is-muted']});
    this.#updateCamButton();
  }

  /**
   * Setup the meeting room closed caption button.
   */
  #setupCCButton() {
    const ccButton = this.#getCCButton();
    if (!ccButton) {
      return;
    }
    const ccObserver = new MutationObserver(() => {
      this.#updateCCButton();
    });
    ccObserver.observe(ccButton, {attributeFilter: ['aria-pressed']});
    this.#updateCCButton();
  }

  /**
   * Setup the meeting room raise hand button.
   */
  #setupHandButton() {
    const handButton = this.#getHandButton();
    if (!handButton) {
      return;
    }
    const handObserver = new MutationObserver(() => {
      this.#updateHandButton();
    });
    handObserver.observe(handButton, {attributeFilter: ['aria-pressed']});
    this.#updateHandButton();
  }

  /**
   * Setup the meeting room info button.
   */
  #setupInfoButton() {
    const infoButton = this.#getInfoButton();
    if (!infoButton) {
      return;
    }
    const infoObserver = new MutationObserver(() => {
      this.#updateInfoButton();
    });
    infoObserver.observe(infoButton, {attributeFilter: ['aria-pressed']});
    this.#updateInfoButton();
  }

  /**
   * Setup the meeting room people list button.
   */
  #setupPeopleButton() {
    const button = this.#getPeopleButton();
    if (!button) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updatePeopleButton();
    });
    observer.observe(button, {attributeFilter: ['aria-pressed']});
    this.#updatePeopleButton();
  }

  /**
   * Setup the meeting room chat button.
   */
  #setupChatButton() {
    const button = this.#getChatButton();
    if (!button) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updateChatButton();
    });
    observer.observe(button, {attributeFilter: ['aria-pressed']});
    this.#updateChatButton();
  }

  /**
   * Setup the meeting room activities button.
   */
  #setupActivitiesButton() {
    const button = this.#getActivitiesButton();
    if (!button) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updateActivitiesButton();
    });
    observer.observe(button, {attributeFilter: ['aria-pressed']});
    this.#updateActivitiesButton();
  }

  /**
   * Setup the meeting room presenting state button.
   */
  #setupPresentingButton() {
    const presentationBar = this.#getPresentationBar();
    if (!presentationBar) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updatePresentingButton();
    });
    observer.observe(presentationBar, {childList: true});
    this.#updatePresentingButton();
  }

  /**
   * Setup the meeting room send a reaction button.
   */
  #setupReactionButton() {
    const button = this.#getReactionButton();
    if (!button) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updateReactionButton();
    });
    observer.observe(button, {attributeFilter: ['aria-pressed']});
    this.#updateReactionButton();
  }

  /**
   * Draw emoji buttons.
   * @param {number} [attempt=0] Retry attempt counter
   */
  async #drawEmojiButtons(attempt = 0) {
    // If we left emoji mode, stop trying
    if (!this.#inEmojiMode) return;

    const emojis = this.#getAvailableEmojis();

    // If not found and we haven't tried enough, retry
    if (emojis.length === 0 && attempt < 10) {
      setTimeout(() => this.#drawEmojiButtons(attempt + 1), 200);
      return;
    }

    this.#resetButtons();
    // Keep the reaction button as "Back/Toggle" and showing "Open" state
    this.#drawButton('reaction-open');

    const reactionId = this.#streamDeck.buttonNameToId('reaction');

    // We want to fill other buttons with emojis
    let emojiIndex = 0;
    // Arbitrary limit 32 for StreamDeck XL
    for (let i = 0; i < 32; i++) {
      if (i === reactionId) continue;
      if (emojiIndex >= emojis.length) break;

      await this.#drawEmoji(i, emojis[emojiIndex].char);
      emojiIndex++;
    }
  }

  /**
   * Exit emoji mode and restore standard buttons
   */
  #exitEmojiMode() {
    this.#inEmojiMode = false;
    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton('end-call');
    this.#drawMeetingButtons();
    // Stop watching logic is implicit as the loop in #watchEmojiPanel checks
    // flag
  }

  /**
   * Watch for emoji panel closing externally
   */
  async #watchEmojiPanel() {
    if (!this.#inEmojiMode) return;

    // Start watcher
    const bar = this.#getReactionBar();
    if (!bar) {
      // Just waiting...
    }
    // If panel is gone, exit logic
    // We give it a grace period if we just started (handled by valid bar check
    // mostly)
    // But if bar is null, maybe we are just waiting for it to open?
    // #drawEmojiButtons has strict retry logic.
    // Here we just want to catch "open -> closed" transition.
    // Simple poll:

    const checkInterval = setInterval(() => {
      if (!this.#inEmojiMode) {
        clearInterval(checkInterval);
        return;
      }

      // Check if reactions are still viable.
      // If the user closed the panel, #getReactionBar might return null
      // or hidden.
      // The "Send a reaction" toolbar usually stays in DOM but might
      // become hidden?
      // Per user DOM: `class="oj6G3d P9KVBf FVKzAb"`
      // `style="bottom: 80px; left: 0px;"`
      // If it closes, does it disappear? Usually yes for "popups" in Meet.

      const checkBar = this.#getReactionBar();
      if (!checkBar || checkBar.offsetParent === null) {
        this.#exitEmojiMode();
        clearInterval(checkInterval);
      }
    }, 1000);
  }

  /**
   * Draw a single emoji on a button.
   * @param {number} buttonId
   * @param {string} char
   */
  async #drawEmoji(buttonId, char) {
    if (!this.#streamDeck?.isConnected) return;

    const size = 72;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Draw directly without rotation.
    // Since we cannot access private #deviceType in StreamDeck.js, we cannot
    // read configuration. However, the user reported 180 rotation (my previous
    // fallback) result was upside down. So 0 rotation (default) should be
    // correct.

    // Apply transformations based on device type
    ctx.translate(size / 2, size / 2);
    if (this.#streamDeck.horizontalFlip) {
      ctx.scale(-1, 1);
    }
    const rotation = this.#streamDeck.imageRotation || 0;
    ctx.rotate(rotation * Math.PI / 180);
    ctx.translate(-size / 2, -size / 2);

    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(char, size / 2, size / 2 + 5);

    // Reset transform just in case (though ctx is fresh)
    // No need as we are done drawing.

    await this.#streamDeck.fillCanvas(buttonId, canvas);
  }

  /**
   * Handle press on a key when in emoji mode
   * @param {number} buttonId
   */
  #handleEmojiPress(buttonId) {
    const reactionId = this.#streamDeck.buttonNameToId('reaction');
    const emojis = this.#getAvailableEmojis();

    // Reconstruct the mapping logic to find index
    let emojiIndex = 0;
    let found = false;
    for (let i = 0; i < 32; i++) {
      if (i === reactionId) continue;
      if (i === buttonId) {
        found = true;
        break;
      }
      emojiIndex++;
    }

    if (found && emojiIndex < emojis.length) {
      const emoji = emojis[emojiIndex];
      this.#tapReactionEmoji(emoji.label);
    }
  }

  /**
   * Get available emojis from the DOM.
   * @return {Array<{label: string, char: string}>}
   */
  #getAvailableEmojis() {
    const bar = this.#getReactionBar();
    if (!bar) return [];

    const buttons = bar.querySelectorAll('button');
    const emojis = [];

    buttons.forEach((btn) => {
      const label = btn.getAttribute('aria-label');
      // Prefer data-emoji attribute as innerText might be empty for images
      const char = btn.getAttribute('data-emoji') ||
        btn.innerText ||
        btn.textContent ||
        label;

      if (label && char) {
        // filter out "More emojis" or other non-emoji buttons if they sneak in
        // A simple check is if char is short (1-2 chars usually)
        // or if it matches the label.

        // Use data-emoji if available, it's the most reliable source.
        if (btn.hasAttribute('data-emoji')) {
          emojis.push({ label, char: btn.getAttribute('data-emoji') });
        } else if (char.trim()) {
          emojis.push({ label, char: char.trim() });
        }
      }
    });
    return emojis;
  }

  /**
   * Setup the green room mic button.
   */
  #setupGreenRoomMicButton() {
    const button = this.#getGreenRoomMicButton();
    if (!button) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updateGreenRoomMicButton();
    });
    observer.observe(button, {attributeFilter: ['data-is-muted']});
    this.#updateGreenRoomMicButton();
  }

  /**
   * Setup the green room camera button.
   */
  #setupGreenRoomCamButton() {
    const button = this.#getGreenRoomCamButton();
    if (!button) {
      return;
    }
    const observer = new MutationObserver(() => {
      this.#updateGreenRoomCamButton();
    });
    observer.observe(button, {attributeFilter: ['data-is-muted']});
    this.#updateGreenRoomCamButton();
  }


  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Update the StreamDeck buttons based on current state. Will be
   * called by the mutation observers created above.
   *
   */

  /**
   * Update the StreamDeck mic button to indicate current state.
   */
  #updateMicButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getMicButton();
    if (!button) {
      return;
    }
    const newVal = button.dataset?.isMuted == 'true';
    const img = newVal ? 'mic-disabled' : 'mic';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck camera button to indicate current state.
   */
  #updateCamButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getCamButton();
    if (!button) {
      return;
    }
    const newVal = button.dataset?.isMuted == 'true';
    const img = newVal ? 'cam-disabled' : 'cam';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck CC button to indicate current state.
   */
  #updateCCButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getCCButton();
    if (!button) {
      return;
    }
    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'cc-on' : 'cc';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck hand button to indicate current state.
   */
  #updateHandButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getHandButton();
    if (!button) {
      return;
    }
    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'hand-raised' : 'hand';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck info button to indicate current state.
   */
  #updateInfoButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getInfoButton();
    if (!button) {
      return;
    }
    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'info-open' : 'info';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck people button to indicate current state.
   */
  #updatePeopleButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getPeopleButton();
    if (!button) {
      return;
    }
    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'users-open' : 'users';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck chat button to indicate current state.
   */
  #updateChatButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getChatButton();
    if (!button) {
      return;
    }
    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'chat-open' : 'chat';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck activities button to indicate current state.
   */
  #updateActivitiesButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getActivitiesButton();
    if (!button) {
      return;
    }
    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'activities-open' : 'activities';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck stop presenting button to indicate current state.
   */
  #updatePresentingButton() {
    if (this.#inEmojiMode) return;
    const button = this.#getStopPresentingButton();
    const img = button ? 'present-stop' : 'blank';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck Send a Reaction button to indicate current state.
   */
  #updateReactionButton() {
    const button = this.#getReactionButton();
    if (!button) {
      // If we can't find the button, we might be in a state where it's hidden
      // or we shouldn't update.
      return;
    }
    // If in emoji mode, we handle buttons manually
    if (this.#inEmojiMode) return;

    const newVal = button.getAttribute('aria-pressed') == 'true';
    const img = newVal ? 'reaction-open' : 'reaction';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck mic button (green room) to indicate current state.
   */
  #updateGreenRoomMicButton() {
    const button = this.#getGreenRoomMicButton();
    if (!button) {
      return;
    }
    const newVal = button.dataset?.isMuted == 'true';
    const img = newVal ? 'mic-disabled' : 'mic';
    this.#drawButton(img);
  }

  /**
   * Update the StreamDeck camera button (green room) to indicate current state.
   */
  #updateGreenRoomCamButton() {
    const button = this.#getGreenRoomCamButton();
    if (!button) {
      return;
    }
    const newVal = button.dataset?.isMuted == 'true';
    const img = newVal ? 'cam-disabled' : 'cam';
    this.#drawButton(img);
  }


  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Helpers to get Meet UI elements.
   *
   */

  /**
   * Get the Start Instant Meeting button (lobby).
   *
   * @return {?Element}
   */
  #getStartInstantMeetingButton() {
    return document.querySelector('[jsname=CuSyi]');
  }

  /**
   * Get the Start Next Meeting button (lobby).
   *
   * @return {?Element}
   */
  #getStartNextMeetingButton() {
    return document.querySelector('[data-default-focus=true]');
  }

  /**
   * Get the Join Meeting button (green room).
   *
   * @return {?Element}
   */
  #getEnterMeetingButton() {
    return document.querySelector('[jsname=Qx7uuf]');
  }

  /**
   * Get the Meeting Info dialog shown for instant meetings (meeting).
   *
   * @return {?Element}
   */
  #getMeetingInfoDialog() {
    return document.querySelector('[jscontroller=Cmkwqf]');
  }

  /**
   * Get the close button for the Meeting Info dialog (meeting).
   *
   * @return {?Element}
   */
  #getMeetingInfoDialogCloseButton() {
    const dialog = document.querySelector('[jscontroller=Cmkwqf]');
    if (dialog) {
      return dialog.querySelector('[aria-label=Close]');
    }
  }

  /**
   * Get the presentation bar container (meeting).
   *
   * @return {?Element}
   */
  #getPresentationBar() {
    return document.querySelector('[jscontroller=E9nYD]');
  }

  /**
   * Get the Mic button in the meeting room.
   *
   * @return {?Element}
   */
  #getMicButton() {
    const sel = '[jscontroller=eB6kvd]';
    return document.querySelector(sel)?.querySelector('button[data-is-muted]');
  }

  /**
   * Get the Camera button in the meeting room.
   *
   * @return {?Element}
   */
  #getCamButton() {
    const sel = '[jscontroller=bwqwSd]';
    return document.querySelector(sel)?.querySelector('button[data-is-muted]');
  }

  /**
   * Get the CC button in the meeting room.
   *
   * @return {?Element}
   */
  #getCCButton() {
    const sel = '[jscontroller=iBwifb]';
    return document.querySelector(sel)?.querySelector('button');
  }

  /**
   * Get the Raise Hand button in the meeting room.
   *
   * @return {?Element}
   */
  #getHandButton() {
    const sel = '[jscontroller=LtjzW]';
    return document.querySelector(sel)?.querySelector('button');
  }

  /**
   * Get the Stop Presenting button in the meeting room.
   *
   * @return {?Element}
   */
  #getStopPresentingButton() {
    const sel = '[jsname=aK5XXd]';
    return document.querySelector(sel);
  }

  /**
   * Get the Info button in the meeting room.
   *
   * @return {?Element}
   */
  #getInfoButton() {
    const sel = 'button[data-panel-id="5"]';
    return document.querySelector(sel);
  }

  /**
   * Get the People button in the meeting room.
   *
   * @return {?Element}
   */
  #getPeopleButton() {
    const sel = 'button[data-panel-id="1"]';
    return document.querySelector(sel);
  }

  /**
   * Get the Chat button in the meeting room.
   *
   * @return {?Element}
   */
  #getChatButton() {
    const sel = 'button[data-panel-id="2"]';
    return document.querySelector(sel);
  }

  /**
   * Get the Activities button in the meeting room.
   *
   * @return {?Element}
   */
  #getActivitiesButton() {
    const sel = 'button[data-panel-id="10"]';
    return document.querySelector(sel);
  }

  /**
   * Gets the Send a reaction button in the meeting room.
   *
   * @return {?Element}
   */
  #getReactionButton() {
    // Try specific controller first
    const sel = '[jscontroller=M3NJxf]';
    let btn = document.querySelector(sel)?.querySelector('button');
    if (btn) return btn;

    // Fallback: Try aria-label (English)
    btn = document.querySelector('button[aria-label="Send a reaction"]');
    if (btn) return btn;

    // Fallback: Try aria-label (French - guessed)
    btn = document.querySelector('button[aria-label="Envoyer une réaction"]');
    return btn;
  }

  /**
   * Gets the Send a reaction bar in the meeting room.
   *
   * @return {?Element}
   */
  #getReactionBar() {
    // Try specific controller first
    const sel = '[jscontroller=tdX73b]';
    let bar = document.querySelector(sel);
    if (bar) return bar;

    // Fallback: Try finding via aria-controls of the button
    const btn = this.#getReactionButton();
    if (btn) {
      const controlsId = btn.getAttribute('aria-controls');
      if (controlsId) {
        bar = document.getElementById(controlsId);
        if (bar) return bar;
      }
    }

    // Fallback: Look for a container that has reaction buttons
    // Look for a known emoji like '💖' or 'Sparkle'
    const sparkleBtn = document.querySelector('button[aria-label="Sparkle"]');
    if (sparkleBtn) {
      return sparkleBtn.closest('[role="dialog"]') || sparkleBtn.closest('div');
    }

    // Fallback: Explicit toolbar role with aria-label provided by user
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Send a reaction"]');
    if (toolbar) return toolbar;

    return null;
  }

  /**
   * Gets the send a reaction emoji button in the meeting room.
   *
   * @param {string} emoji Emoji to find
   * @return {?Element}
   */
  #getReactionEmojiButton(emoji) {
    const sel = `[aria-label="${emoji.replace(/"/g, '\\"')}"]`;
    return document.querySelector(sel);
  }

  /**
   * Taps a specific reaction emoji
   * @param {string} emojiLabel
   */
  #tapReactionEmoji(emojiLabel) {
    const button = this.#getReactionEmojiButton(emojiLabel);
    this.#tapButtonWrapper(button, `emoji-${emojiLabel}`);
  }

  /**
   * Get the Hang Up button in the meeting room.
   *
   * @return {?Element}
   */
  #getHangupButton() {
    const sel = '[jscontroller=m1IMT]';
    return document.querySelector(sel)?.querySelector('button');
  }

  /**
   * Get the Mic button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomMicButton() {
    const sel = '[jscontroller=t2mBxb]';
    return document.querySelector(sel)?.querySelector('[role=button]');
  }

  /**
   * Get the Camera button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomCamButton() {
    const sel = '[jscontroller=bwqwSd]';
    return document.querySelector(sel)?.querySelector('[role=button]');
  }

  /**
   * Get the Rejoin Meeting button in the exit hall.
   *
   * @return {?Element}
   */
  #getRejoinButton() {
    const sel = '[jsname=oI7Fj] button';
    return document.querySelector(sel);
  }

  /**
   * Get the Return to Home button in the exit hall.
   *
   * @return {?Element}
   */
  #getReturnToHomeButton() {
    const sel = '[jsname=WIVZEd] button';
    return document.querySelector(sel);
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Helpers to interact with Meet UI elements.
   *
   */

  /**
   * Wrapper for clicking on a button with logging if the button cannot be
   * found.
   *
   * @param {Element} button Button to click
   * @param {?String} buttName Name of button (used for logging only)
   */
  #tapButtonWrapper(button, buttName) {
    if (button) {
      button.click();
      return;
    }
    console.warn('*SD-Meet*', `Unable to find/click button '${buttName}'`);
  }

  /**
   * Toggles the tab between full screen and regular.
   */
  async #toggleFullScreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.body.requestFullscreen();
      }
    } catch (ex) {
      // Cannot do fullscreen, disable the button.
      this.#drawButton(`fullscreen-disabled`);
    }
  }

  /**
   * Starts an instant meeting (lobby).
   */
  #tapStartInstantMeeting() {
    const button = this.#getStartInstantMeetingButton();
    this.#tapButtonWrapper(button, 'startInstant');
  }

  /**
   * Starts the next meeting (lobby).
   */
  #tapStartNextMeeting() {
    const button = this.#getStartNextMeetingButton();
    this.#tapButtonWrapper(button, 'startNext');
  }

  /**
   * Taps the mic button, to mute/unmute the mic (green room).
   */
  #tapGreenRoomMic() {
    const button = this.#getGreenRoomMicButton();
    this.#tapButtonWrapper(button, 'greenMic');
  }

  /**
   * Taps the camera button, to mute/unmute the camera (green room).
   */
  #tapGreenRoomCam() {
    const button = this.#getGreenRoomCamButton();
    this.#tapButtonWrapper(button, 'greenCam');
  }

  /**
   * Enter/join meeting (green room).
   */
  #tapEnterMeeting() {
    const button = this.#getEnterMeetingButton();
    this.#tapButtonWrapper(button, 'enterMeeting');
  }

  /**
   * Taps the mic button to mute/unmute (meeting room).
   */
  #tapMic() {
    const button = this.#getMicButton();
    this.#tapButtonWrapper(button, 'micOnOff');
  }

  /**
   * Taps the camera button, to mute/unmute (meeting room).
   */
  #tapCam() {
    const button = this.#getCamButton();
    this.#tapButtonWrapper(button, 'camOnOff');
  }

  /**
   * Taps the handup button, to toggle the hand state (meeting room).
   */
  #tapHand() {
    const button = this.#getHandButton();
    this.#tapButtonWrapper(button, 'hand');
  }

  /**
   * Taps the CC button, to toggle the captions (meeting room).
   */
  #tapCC() {
    const button = this.#getCCButton();
    this.#tapButtonWrapper(button, 'cc');
  }

  /**
   * Taps the Info button, to toggle info panel (meeting room).
   */
  #tapInfo() {
    const button = this.#getInfoButton();
    this.#tapButtonWrapper(button, 'info');
  }

  /**
   * Taps the Users button, to toggle the list of users (meeting room).
   */
  #tapUsers() {
    const button = this.#getPeopleButton();
    this.#tapButtonWrapper(button, 'people');
  }

  /**
   * Taps the Chat button, to toggle the chat panel (meeting room).
   */
  #tapChat() {
    const button = this.#getChatButton();
    this.#tapButtonWrapper(button, 'chat');
  }

  /**
   * Taps the Activities button, to toggle activities panel (meeting room).
   */
  #tapActivities() {
    const button = this.#getActivitiesButton();
    this.#tapButtonWrapper(button, 'activities');
  }

  /**
   * Taps the Send a reaction button, to toggle reaction panel (meeting room).
   */
  #tapReactions() {
    const button = this.#getReactionButton();
    this.#tapButtonWrapper(button, 'reactions');
  }

  /**
   * Taps the stop presenting button (meeting room).
   */
  #tapStopPresenting() {
    const button = this.#getStopPresentingButton();
    this.#tapButtonWrapper(button, 'stopPresenting');
  }

  /**
   * Taps close button on the meeting info dialog (meeting room).
   */
  #tapCloseInfoDialog() {
    const button = this.#getMeetingInfoDialogCloseButton();
    // We most likely don't care if this isn't open, if it is, close it
    // but no need to log that we couldn't find it.
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Hang Up button, to end the call (meeting room).
   */
  #tapHangUp() {
    const button = this.#getHangupButton();
    this.#tapButtonWrapper(button, 'hangUp');
  }

  /**
   * Taps the Rejoin button (exit hall).
   */
  #tapRejoin() {
    const button = this.#getRejoinButton();
    this.#tapButtonWrapper(button, 'reJoin');
  }

  /**
   * Taps the Return to Home Screen button (exit hall).
   */
  #tapHome() {
    const button = this.#getReturnToHomeButton();
    this.#tapButtonWrapper(button, 'returnToHome');
  }
}
