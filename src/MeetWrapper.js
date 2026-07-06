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
  #emojiWatchInterval = null;

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

    this.#streamDeck.addEventListener('connect', () => {
      this.#redrawCurrentRoom();
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
    if (pathname === '/' || pathname === '/landing' || pathname === '/home') {
      this.#enterLobby();
    }

    const checkRoom = () => {
      if (typeof document === 'undefined' || !document || !document.body) {
        return;
      }
      try {
        const hasMeetingTitle = document.querySelector('div[data-meeting-title]');
        const hasHangup = this.#getHangupButton();

        const hasGreenRoomController = document.querySelector('[jscontroller=dyDNGc]');
        const hasEnterMeeting = this.#getEnterMeetingButton();

        const hasExitHallController = document.querySelector('[jsname=r4nke]');
        const hasRejoin = this.#getRejoinButton();

        console.warn('*SD-Meet* checkRoom state:', {
          hasMeetingTitle: !!hasMeetingTitle,
          hasHangup: !!hasHangup,
          hasGreenRoomController: !!hasGreenRoomController,
          hasEnterMeeting: !!hasEnterMeeting,
          hasExitHallController: !!hasExitHallController,
          hasRejoin: !!hasRejoin
        });

        if (hasMeetingTitle || hasHangup) {
          this.#enterMeeting();
        } else if (hasGreenRoomController || hasEnterMeeting) {
          this.#enterGreenRoom();
        } else if (hasExitHallController || hasRejoin) {
          this.#enterExitHall();
        }
      } catch (e) {
        // ignore errors during teardown
      }
    };

    checkRoom();

    const bodyObserver = new MutationObserver(checkRoom);
    bodyObserver.observe(document.body, {childList: true, subtree: true});
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
    this.#clearEmojiMode();
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
    this.#clearEmojiMode();
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`enter-meeting`);
    this.#drawButton(`home`);

    this.#retrySetup(
        this.#ROOM_NAMES.greenRoom,
        () => this.#getGreenRoomMicButton() && this.#getGreenRoomCamButton(),
        () => {
          this.#setupGreenRoomMicButton();
          this.#setupGreenRoomCamButton();
        },
    );
  }

  /**
   * Set up buttons for the meeting room.
   */
  #enterMeeting() {
    if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.meeting;
    this.#clearEmojiMode();
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`end-call`);

    this.#retrySetup(
        this.#ROOM_NAMES.meeting,
        () => this.#getMicButton() ||
              this.#getCamButton() ||
              this.#getHangupButton(),
        () => {
          this.#drawMeetingButtons();
        },
    );

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
    this.#clearEmojiMode();
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
      if (!this.#inEmojiMode) break;
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
    this.#clearEmojiMode();
    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton('end-call');
    this.#drawMeetingButtons();
  }

  /**
   * Watch for emoji panel closing externally
   */
  async #watchEmojiPanel() {
    if (!this.#inEmojiMode) return;

    if (this.#emojiWatchInterval) {
      clearInterval(this.#emojiWatchInterval);
    }

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

    this.#emojiWatchInterval = setInterval(() => {
      if (!this.#inEmojiMode) {
        clearInterval(this.#emojiWatchInterval);
        this.#emojiWatchInterval = null;
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
          emojis.push({label, char: btn.getAttribute('data-emoji')});
        } else if (char.trim()) {
          emojis.push({label, char: char.trim()});
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
  /**
   * Find element matching candidate selectors and containing an SVG path
   * with a given signature prefix or pattern.
   *
   * @param {string} selector Candidate elements query.
   * @param {string} pathPrefix Start of the path data string (d attribute).
   * @return {?Element}
   */
  #findElementBySvgPath(selector, pathPrefix) {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
      const paths = el.querySelectorAll('svg path');
      for (const path of paths) {
        const d = path.getAttribute('d');
        if (d && d.includes(pathPrefix)) {
          return el;
        }
      }
    }
    return null;
  }

  /**
   * Find element by checking if any of its aria-attributes or tooltips
   * match a list of regex/substring patterns.
   *
   * @param {string} selector Candidate elements query.
   * @param {Array<string>} patterns Substring patterns to look for.
   * @param {Array<string>} excludePatterns Substring patterns to exclude.
   * @return {?Element}
   */
  #findElementByAriaPatterns(selector, patterns, excludePatterns = []) {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
      const ariaLabel = el.getAttribute('aria-label') || '';
      const tooltip = el.getAttribute('data-tooltip') || '';
      const matches = patterns.some((pattern) =>
        ariaLabel.toLowerCase().includes(pattern.toLowerCase()) ||
        tooltip.toLowerCase().includes(pattern.toLowerCase()),
      );
      const excluded = excludePatterns.some((pattern) =>
        ariaLabel.toLowerCase().includes(pattern.toLowerCase()) ||
        tooltip.toLowerCase().includes(pattern.toLowerCase()),
      );
      if (matches && !excluded) {
        return el;
      }
    }
    return null;
  }

  /**
   * Find element by checking if its textContent matches a list of substring
   * patterns.
   *
   * @param {string} selector Candidate elements query.
   * @param {Array<string>} patterns Substring patterns to look for.
   * @param {Array<string>} excludePatterns Substring patterns to exclude.
   * @return {?Element}
   */
  #findElementByTextContent(selector, patterns, excludePatterns = []) {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
      const text = el.textContent || '';
      const matches = patterns.some((pattern) =>
        text.toLowerCase().includes(pattern.toLowerCase()),
      );
      const excluded = excludePatterns.some((pattern) =>
        text.toLowerCase().includes(pattern.toLowerCase()),
      );
      if (matches && !excluded) {
        return el;
      }
    }
    return null;
  }

  /**
   * Get the Start Instant Meeting button (lobby).
   *
   * @return {?Element}
   */
  /**
   * Get the Start Instant Meeting button (lobby).
   *
   * @return {?Element}
   */
  #getStartInstantMeetingButton() {
    let btn = document.querySelector('[jsname=CuSyi]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button, [role="button"]', 'M19 13') ||
          this.#findElementBySvgPath('button, [role="button"]', 'M20 5') ||
          this.#findElementBySvgPath('button, [role="button"]', 'M19 10');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button, [role="button"], [role="menuitem"]',
        ['instant'],
    );
    if (btn) return btn;

    btn = this.#findElementByTextContent(
        'button, [role="button"], [role="menuitem"]',
        ['instant', 'réunion instantanée'],
    );
    return btn;
  }

  /**
   * Get the Start Next Meeting button (lobby).
   *
   * @return {?Element}
   */
  #getStartNextMeetingButton() {
    let btn = document.querySelector('[data-default-focus=true]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button, [role="button"]', 'M19 13') ||
          this.#findElementBySvgPath('button, [role="button"]', 'M20 5');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button, [role="button"]',
        ['join', 'next', 'suivante'],
    );
    if (btn) return btn;

    btn = this.#findElementByTextContent(
        'button, [role="button"]',
        ['join', 'next', 'participer', 'suivante'],
    );
    return btn;
  }

  /**
   * Get the Join Meeting button (green room).
   *
   * @return {?Element}
   */
  #getEnterMeetingButton() {
    let btn = document.querySelector('[jsname=Qx7uuf]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button, [role="button"]', 'M19 13') ||
          this.#findElementBySvgPath('button, [role="button"]', 'M12 4');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button, [role="button"]',
        ['join', 'ask', 'entrer', 'participer', 'demander'],
    );
    if (btn) return btn;

    btn = this.#findElementByTextContent(
        'button, [role="button"]',
        ['join', 'ask', 'entrer', 'participer', 'demander'],
    );
    return btn;
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
    const dialog = this.#getMeetingInfoDialog();
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
    const primarySel = '[jscontroller=eB6kvd]';
    let btn = document.querySelector(primarySel)
        ?.querySelector('button[data-is-muted]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button[data-is-muted]', 'M12 14') ||
          this.#findElementBySvgPath('button[data-is-muted]', 'M11 5');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M12 14') ||
          this.#findElementBySvgPath('button', 'M11 5');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button[data-is-muted]',
        ['microphone', 'micro', 'mikro', 'audio', 'mute', 'stummschalten'],
        [
          'camera', 'caméra', 'video', 'vidéo',
          'settings', 'paramètre', 'option', 'einstellung',
          'config', 'ajustes',
        ],
    );
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        ['microphone', 'micro', 'mikro', 'audio', 'mute', 'stummschalten'],
        [
          'camera', 'caméra', 'video', 'vidéo',
          'settings', 'paramètre', 'option', 'einstellung',
          'config', 'ajustes',
        ],
    );
    return btn;
  }

  /**
   * Get the Camera button in the meeting room.
   *
   * @return {?Element}
   */
  #getCamButton() {
    const primarySel = '[jscontroller=bwqwSd]';
    let btn = document.querySelector(primarySel)
        ?.querySelector('button[data-is-muted]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button[data-is-muted]', 'M18 10.48');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M18 10.48');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button[data-is-muted]',
        ['camera', 'caméra', 'kamera', 'video', 'vidéo'],
        [
          'settings', 'paramètre', 'option', 'config',
          'einstellung', 'ajustes',
        ],
    );
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        ['camera', 'caméra', 'kamera', 'video', 'vidéo'],
        [
          'settings', 'paramètre', 'option', 'config',
          'einstellung', 'ajustes',
        ],
    );
    return btn;
  }

  /**
   * Get the CC button in the meeting room.
   *
   * @return {?Element}
   */
  #getCCButton() {
    const primarySel = '[jscontroller=iBwifb]';
    let btn = document.querySelector(primarySel)?.querySelector('button');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M19.5 5.5') ||
          this.#findElementBySvgPath('button', 'M19 4H5');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        [
          'caption', 'sous-titre', 'subtitle',
          'subtítulo', 'subtitulo', 'untertitel',
        ],
        [
          'settings', 'paramètre', 'option', 'config',
          'einstellung', 'ajustes',
        ],
    );
    return btn;
  }

  /**
   * Get the Raise Hand button in the meeting room.
   *
   * @return {?Element}
   */
  #getHandButton() {
    const primarySel = '[jscontroller=LtjzW]';
    let btn = document.querySelector(primarySel)?.querySelector('button');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M18 24') ||
          this.#findElementBySvgPath('button', 'M4.14 15.28');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        ['hand', 'main', 'mano'],
        [
          'all', 'toutes', 'todos', 'todas', 'moderator',
          'modérateur', 'host', 'hôte', 'lower all',
          'baisser toutes', 'bajar todas', 'bajar',
        ],
    );
    return btn;
  }

  /**
   * Get the Stop Presenting button in the meeting room.
   *
   * @return {?Element}
   */
  #getStopPresentingButton() {
    const primarySel = '[jsname=aK5XXd]';
    let btn = document.querySelector(primarySel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M21 3');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        ['present', 'présent', 'share', 'partage', 'stop'],
        [
          'recording', 'enregistrement', 'video', 'vidéo',
          'stream', 'camera', 'caméra', 'mic',
          'microphone', 'sharing settings',
        ],
    );
    return btn;
  }

  /**
   * Get the Info button in the meeting room.
   *
   * @return {?Element}
   */
  #getInfoButton() {
    const sel = 'button[data-panel-id="5"]';
    let btn = document.querySelector(sel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M11 17') ||
          this.#findElementBySvgPath('button', 'M12 2C') ||
          this.#findElementBySvgPath('button', 'M12 9');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        [
          'info', 'details', 'détails', 'meeting details',
          'informations sur la réunion', 'detalles',
        ],
    );
    return btn;
  }

  /**
   * Get the People button in the meeting room.
   *
   * @return {?Element}
   */
  #getPeopleButton() {
    const sel = 'button[data-panel-id="1"]';
    let btn = document.querySelector(sel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M9 8c') ||
          this.#findElementBySvgPath('button', 'M12 6') ||
          this.#findElementBySvgPath('button', 'M16 11');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        [
          'people', 'participants', 'utilisateurs', 'membres',
          'show everyone', 'afficher tous les participants',
        ],
    );
    return btn;
  }

  /**
   * Get the Chat button in the meeting room.
   *
   * @return {?Element}
   */
  #getChatButton() {
    const sel = 'button[data-panel-id="2"]';
    let btn = document.querySelector(sel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M20 2H4') ||
          this.#findElementBySvgPath('button', 'M20 2c') ||
          this.#findElementBySvgPath('button', 'M21 15') ||
          this.#findElementBySvgPath('button', 'M18 15');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        [
          'chat', 'discussion', 'clavier', 'messagerie',
          'chat with everyone', 'discuter avec tout le monde',
        ],
    );
    return btn;
  }

  /**
   * Get the Activities button in the meeting room.
   *
   * @return {?Element}
   */
  #getActivitiesButton() {
    const sel = 'button[data-panel-id="10"]';
    let btn = document.querySelector(sel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M12 2l') ||
          this.#findElementBySvgPath('button', 'M12 2L');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        [
          'activities', 'activités', 'animation',
          'greffons', 'actividades',
        ],
    );
    return btn;
  }

  /**
   * Gets the Send a reaction button in the meeting room.
   *
   * @return {?Element}
   */
  #getReactionButton() {
    const primarySel = '[jscontroller=M3NJxf]';
    let btn = document.querySelector(primarySel)?.querySelector('button');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M15.5 11');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        ['reaction', 'réaction', 'emoji'],
    );
    return btn;
  }

  /**
   * Gets the Send a reaction bar in the meeting room.
   *
   * @return {?Element}
   */
  #getReactionBar() {
    const sel = '[jscontroller=tdX73b]';
    let bar = document.querySelector(sel);
    if (bar) return bar;

    const btn = this.#getReactionButton();
    if (btn) {
      const controlsId = btn.getAttribute('aria-controls');
      if (controlsId) {
        bar = document.getElementById(controlsId);
        if (bar) return bar;
      }
    }

    const sparkleBtn = document.querySelector('button[aria-label="Sparkle"]');
    if (sparkleBtn) {
      return sparkleBtn.closest('[role="dialog"]') || sparkleBtn.closest('div');
    }

    const toolbar = document.querySelector(
        '[role="toolbar"][aria-label="Send a reaction"]',
    );
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
    const primarySel = '[jscontroller=m1IMT]';
    let btn = document.querySelector(primarySel)?.querySelector('button');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button', 'M23.62 11.27');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button',
        ['leave', 'hang', 'quitter', 'raccrocher', 'call'],
    );
    return btn;
  }

  /**
   * Get the Mic button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomMicButton() {
    const primarySel = '[jscontroller=t2mBxb]';
    let btn = document.querySelector(primarySel)
        ?.querySelector('[role=button]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('[role="button"], button', 'M12 14') ||
          this.#findElementBySvgPath('[role="button"], button', 'M11 5');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        '[role="button"], button',
        ['microphone', 'micro', 'mikro', 'audio', 'mute', 'stummschalten'],
        [
          'camera', 'caméra', 'video', 'vidéo',
          'settings', 'paramètre', 'option', 'einstellung',
          'config', 'ajustes',
        ],
    );
    return btn;
  }

  /**
   * Get the Camera button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomCamButton() {
    const primarySel = '[jscontroller=bwqwSd]';
    let btn = document.querySelector(primarySel)
        ?.querySelector('[role=button]');
    if (btn) return btn;

    btn = this.#findElementBySvgPath('[role="button"], button', 'M18 10.48');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        '[role="button"], button',
        ['camera', 'caméra', 'kamera', 'video', 'vidéo'],
        [
          'settings', 'paramètre', 'option', 'config',
          'einstellung', 'ajustes',
        ],
    );
    return btn;
  }

  /**
   * Get the Rejoin Meeting button in the exit hall.
   *
   * @return {?Element}
   */
  #getRejoinButton() {
    const primarySel = '[jsname=oI7Fj] button';
    let btn = document.querySelector(primarySel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button, [role="button"]', 'M12 6v') ||
          this.#findElementBySvgPath('button, [role="button"]', 'M12 5');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button, [role="button"]',
        ['rejoin', 'se reconnecter', 'recommencer'],
    );
    if (btn) return btn;

    btn = this.#findElementByTextContent(
        'button, [role="button"]',
        ['rejoin', 'se reconnecter', 'recommencer'],
    );
    return btn;
  }

  /**
   * Get the Return to Home button in the exit hall.
   *
   * @return {?Element}
   */
  #getReturnToHomeButton() {
    const primarySel = '[jsname=WIVZEd] button';
    let btn = document.querySelector(primarySel);
    if (btn) return btn;

    btn = this.#findElementBySvgPath('button, [role="button"]', 'M10 20') ||
          this.#findElementBySvgPath('button, [role="button"]', 'M10 19');
    if (btn) return btn;

    btn = this.#findElementByAriaPatterns(
        'button, [role="button"]',
        ['home', 'accueil', 'écran d\'accueil', 'principal'],
    );
    if (btn) return btn;

    btn = this.#findElementByTextContent(
        'button, [role="button"]',
        ['home', 'accueil', 'écran d\'accueil', 'principal'],
    );
    return btn;
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

  /**
   * Clear emoji mode state and the watch interval.
   */
  #clearEmojiMode() {
    this.#inEmojiMode = false;
    if (this.#emojiWatchInterval) {
      clearInterval(this.#emojiWatchInterval);
      this.#emojiWatchInterval = null;
    }
  }

  /**
   * Redraw the current room setup on the Stream Deck.
   */
  #redrawCurrentRoom() {
    if (!this.#streamDeck?.isConnected) {
      return;
    }
    this.#resetButtons();
    this.#drawFullScreenButton();
    if (this.#currentRoom === this.#ROOM_NAMES.lobby) {
      this.#drawButton(`start-next`);
      this.#drawButton(`start-instant`);
    } else if (this.#currentRoom === this.#ROOM_NAMES.greenRoom) {
      this.#drawButton(`enter-meeting`);
      this.#drawButton(`home`);
      this.#updateGreenRoomMicButton();
      this.#updateGreenRoomCamButton();
    } else if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      this.#drawButton(`end-call`);
      this.#drawMeetingButtons();
    } else if (this.#currentRoom === this.#ROOM_NAMES.exitHall) {
      this.#drawButton(`rejoin`);
      this.#drawButton(`home`);
    }
  }

  /**
   * Retry setup logic at intervals until conditions are met or timeout is
   * reached.
   *
   * @param {string} roomName Name of the room checking for
   * @param {Function} checkFn Function returning boolean if elements are ready
   * @param {Function} setupFn Function executing final observer/drawing setup
   * @param {number} [maxAttempts=50] Maximum number of check attempts
   * @param {number} [intervalMs=100] Interval between checks in milliseconds
   */
  #retrySetup(roomName, checkFn, setupFn, maxAttempts = 50, intervalMs = 100) {
    let attempts = 0;
    const interval = setInterval(() => {
      if (this.#currentRoom !== roomName) {
        clearInterval(interval);
        return;
      }
      if (checkFn()) {
        clearInterval(interval);
        setupFn();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('*SD-Meet*', `Failed to find elements for room ${roomName} after ${maxAttempts} attempts`);
        setupFn();
      }
      attempts++;
    }, intervalMs);
  }
}
