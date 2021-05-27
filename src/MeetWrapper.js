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

  #ROOM_NAMES = {
    lobby: 'lobby',
    greenRoom: 'greenRoom',
    meeting: 'meeting',
    exitHall: 'exitHall',
  };

  #streamDeck;
  #hueLights;

  /**
   * Constructor
   *
   * @param {HIDDevice} streamDeck
   * @param {HueHelper} hueLights
   */
  constructor(streamDeck, hueLights) {
    this.#streamDeck = streamDeck;
    this.#streamDeck.addEventListener('keydown', (evt) => {
      this.#handleStreamDeckPress(evt.detail.buttonId);
    });

    if (hueLights?.isAvailable) {
      this.#hueLights = hueLights;
    }

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
    if (window.location.pathname === '/') {
      this.#enterLobby();
      return;
    }

    const bodyObserver = new MutationObserver(() => {
      if (document.querySelector('div[data-second-screen]')) {
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
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`start-next`);
    this.#drawButton(`start-instant`);

    if (this.#hueLights?.auto) {
      this.#hueLights.on(false);
    }
  }

  /**
   * Set up buttons for the green room.
   */
  #enterGreenRoom() {
    if (this.#currentRoom === this.#ROOM_NAMES.greenRoom) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.greenRoom;
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
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

    if (this.#hueLights?.auto) {
      this.#hueLights.on(true);
    }
  }

  /**
   * Set up buttons for the meeting room.
   */
  #enterMeeting() {
    if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.meeting;
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`end-call`);

    // The timeout is there to make sure the elements have drawn on
    // screen. I should probably use a mutation observer to see when they
    // drawn, then render them, but I'm feeling kinda lazy today.
    setTimeout(() => {
      this.#setupMicButton();
      this.#setupCamButton();
      this.#setupCCButton();
      this.#setupHandButton();
      this.#setupInfoButton();
      this.#setupPeopleButton();
      this.#setupChatButton();
      this.#setupActivitiesButton();
      this.#setupPresentingButton();
    }, 500);

    // If it was an instant meeting, automatically close
    // the info dialog after 10 seconds.
    setTimeout(() => {
      this.#tapCloseInfoDialog();
    }, 10 * 1000);

    if (this.#hueLights?.auto) {
      this.#hueLights.on(true);
    }
  }

  /**
   * Set up buttons for the exit hall.
   */
  #enterExitHall() {
    if (this.#currentRoom === this.#ROOM_NAMES.exitHall) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.exitHall;
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`rejoin`);
    this.#drawButton(`home`);

    if (this.#hueLights?.auto) {
      this.#hueLights.on(false);
    }
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
    // Hue light buttons, used in all rooms.
    if (this.#hueLights) {
      if (buttonId === this.#streamDeck.buttonNameToId('light-on')) {
        this.#hueLights.on(true);
        return;
      }
      if (buttonId === this.#streamDeck.buttonNameToId('light-off')) {
        this.#hueLights.on(false);
        return;
      }
    }

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
      if (buttonId === this.#streamDeck.buttonNameToId('info')) {
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
      console.warn(`drawButton failed, unknown icon name: '${iconName}'`);
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
   * Draw buttons for Hue
   */
  #drawHueButtons() {
    if (!this.#hueLights) {
      return;
    }
    this.#drawButton(`light-on`);
    this.#drawButton(`light-off`);
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
    const button = this.#getStopPresentingButton();
    const img = button ? 'present-stop' : 'blank';
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
    return document.querySelector('[jscontroller=A5S1ke]');
  }

  /**
   * Get the Mic button in the meeting room.
   *
   * @return {?Element}
   */
  #getMicButton() {
    const sel = '[jscontroller=t8kvj]';
    return document.querySelector(sel)?.querySelector('button');
  }

  /**
   * Get the Camera button in the meeting room.
   *
   * @return {?Element}
   */
  #getCamButton() {
    const sel = '[jscontroller=DXtw0b]';
    return document.querySelector(sel)?.querySelector('button');
  }

  /**
   * Get the CC button in the meeting room.
   *
   * @return {?Element}
   */
  #getCCButton() {
    const sel = '[jscontroller=U1Cub]';
    return document.querySelector(sel)?.querySelector('button');
  }

  /**
   * Get the Raise Hand button in the meeting room.
   *
   * @return {?Element}
   */
  #getHandButton() {
    const sel = '[jscontroller=HRWIlc]';
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
    const sel = '[data-panel-id="5"]';
    return document.querySelector(sel);
  }

  /**
   * Get the People button in the meeting room.
   *
   * @return {?Element}
   */
  #getPeopleButton() {
    const sel = '[data-panel-id="1"]';
    return document.querySelector(sel);
  }

  /**
   * Get the Chat button in the meeting room.
   *
   * @return {?Element}
   */
  #getChatButton() {
    const sel = '[data-panel-id="2"]';
    return document.querySelector(sel);
  }

  /**
   * Get the Activities button in the meeting room.
   *
   * @return {?Element}
   */
  #getActivitiesButton() {
    const sel = '[data-panel-id="10"]';
    return document.querySelector(sel);
  }

  /**
   * Get the Hang Up button in the meeting room.
   *
   * @return {?Element}
   */
  #getHangupButton() {
    const sel = '[jsname=CQylAd]';
    return document.querySelector(sel);
  }

  /**
   * Get the Mic button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomMicButton() {
    const sel = '[jscontroller=t8kvj]';
    return document.querySelector(sel)?.querySelector('[role=button]');
  }

  /**
   * Get the Camera button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomCamButton() {
    const sel = '[jscontroller=DXtw0b]';
    return document.querySelector(sel)?.querySelector('[role=button]');
  }

  /**
   * Get the Rejoin Meeting button in the exit hall.
   *
   * @return {?Element}
   */
  #getRejoinButton() {
    const sel = '[jsname=oI7Fj] [role=button]';
    return document.querySelector(sel);
  }

  /**
   * Get the Return to Home button in the exit hall.
   *
   * @return {?Element}
   */
  #getReturnToHomeButton() {
    const sel = '[jsname=WIVZEd] [role=button]';
    return document.querySelector(sel);
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   *
   * Helpers to interact with Meet UI elements.
   *
   */

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
    if (button) {
      button.click();
    }
  }

  /**
   * Starts the next meeting (lobby).
   */
  #tapStartNextMeeting() {
    const button = this.#getStartNextMeetingButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the mic button, to mute/unmute the mic (green room).
   */
  #tapGreenRoomMic() {
    const button = this.#getGreenRoomMicButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the camera button, to mute/unmute the camera (green room).
   */
  #tapGreenRoomCam() {
    const button = this.#getGreenRoomCamButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Enter/join meeting (green room).
   */
  #tapEnterMeeting() {
    const button = this.#getEnterMeetingButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the mic button to mute/unmute (meeting room).
   */
  #tapMic() {
    const button = this.#getMicButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the camera button, to mute/unmute (meeting room).
   */
  #tapCam() {
    const button = this.#getCamButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the handup button, to toggle the hand state (meeting room).
   */
  #tapHand() {
    const button = this.#getHandButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the CC button, to toggle the captions (meeting room).
   */
  #tapCC() {
    const button = this.#getCCButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Info button, to toggle info panel (meeting room).
   */
  #tapInfo() {
    const button = this.#getInfoButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Users button, to toggle the list of users (meeting room).
   */
  #tapUsers() {
    const button = this.#getPeopleButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Chat button, to toggle the chat panel (meeting room).
   */
  #tapChat() {
    const button = this.#getChatButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Activities button, to toggle activities panel (meeting room).
   */
  #tapActivities() {
    const button = this.#getActivitiesButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the stop presenting button (meeting room).
   */
  #tapStopPresenting() {
    const button = this.#getStopPresentingButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps close button on the meeting info dialog (meeting room).
   */
  #tapCloseInfoDialog() {
    const button = this.#getMeetingInfoDialogCloseButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Hang Up button, to end the call (meeting room).
   */
  #tapHangUp() {
    const button = this.#getHangupButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Rejoin button (exit hall).
   */
  #tapRejoin() {
    const button = this.#getRejoinButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Return to Home Screen button (exit hall).
   */
  #tapHome() {
    const button = this.#getReturnToHomeButton();
    if (button) {
      button.click();
    }
  }
}
