/* eslint-disable no-invalid-this */

'use strict';

/**
 *
 * @module MeetWrapper
 */
class MeetWrapper { // eslint-disable-line
  #currentRoom;
  #isPresenting = false;
  #isSidePanelVisible = false;

  #ccButtonReady = false;
  #handButtonReady = false;

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

    this.#hueLights = hueLights;

    // Watch for room changes
    if (window.location.pathname === '/') {
      this.#enterLobby();
      return;
    }

    const bodyObserver = new MutationObserver(() => {
      if (document.querySelector('div[data-second-screen]')) {
        this.#enterMeeting();
      } else if (document.querySelector('.KWIIWd')) {
        this.#enterGreenRoom();
      } else if (document.querySelector('.CRFCdf')) {
        this.#enterExitHall();
      }
      this.#updateIsPresenting();
    });
    bodyObserver.observe(document.body, {attributes: true, childList: true});

    const muteObserver = new MutationObserver(async () => {
      await this.#updateIsMicMuted();
      await this.#updateIsCamMuted();
    });
    const muteMutationOpts = {
      attributeFilter: ['data-is-muted'],
      subtree: true,
    };
    muteObserver.observe(document.body, muteMutationOpts);
  }


  /**
   *
   * Methods to setup rooms
   *
   */

  /**
   * Method called when the user enters the Lobby
   */
  #enterLobby() {
    if (this.#currentRoom === this.#ROOM_NAMES.lobby) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.lobby;
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#drawButton(5, `start-next`);
    this.#drawButton(6, `start-instant`);

    if (this.#hueLights?.auto) {
      this.#hueLights.on(false);
    }
  }

  /**
   * Method called when the user enters the Green Room
   */
  #enterGreenRoom() {
    if (this.#currentRoom === this.#ROOM_NAMES.greenRoom) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.greenRoom;
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#drawButton(5, `enter-meeting`);
    this.#updateIsMicMuted();
    this.#updateIsCamMuted();

    if (this.#hueLights?.auto) {
      this.#hueLights.on(false);
    }
  }

  /**
   * Method called when the user joins a meeting
   */
  #enterMeeting() {
    if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.meeting;
    console.log('-ENTER-', this.#currentRoom);

    const statusBarObserver = new MutationObserver((list) => {
      for (const change of list) {
        if (change.type === 'childList' && change.addedNodes.length > 0) {
          if (!this.#handButtonReady && this.#getHandButton()) {
            this.#setupHandButton();
          }
          if (!this.#ccButtonReady && this.#getCCButton()) {
            this.#setupCCButton();
          }
        }
      }
    });
    const statusBarMOOpts = {subtree: true, childList: true};
    statusBarObserver.observe(this.#getStatusBar(), statusBarMOOpts);

    const selectedPanelObserver = new MutationObserver(() => {
      this.#updateSidePanel();
    });
    const selectedPanelMOOpts = {
      attributeFilter: ['aria-selected'],
      subtree: true,
    };

    const sidePanelObserver = new MutationObserver(() => {
      const picker = document.querySelector('[jsname=I0Fcpe]');
      const newVal = picker ? true : false;
      if (this.#isSidePanelVisible === newVal) {
        return;
      }
      this.#isSidePanelVisible = newVal;
      this.#updateSidePanel();
      if (newVal) {
        selectedPanelObserver.observe(picker, selectedPanelMOOpts);
      }
    });
    const sidePanelMOOpts = {
      childList: true,
      attributeFilter: ['aria-selected'],
    };
    const sidePanelElem = document.querySelector('[jsname=o4MlPd]');
    sidePanelObserver.observe(sidePanelElem, sidePanelMOOpts);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#updateSidePanel();
    this.#updateIsMicMuted();
    this.#updateIsCamMuted();
    this.#updateHandState();
    this.#updateCCState();
    this.#drawButton(14, `end-call`);

    if (this.#hueLights?.auto) {
      this.#hueLights.on(false);
    }
  }

  /**
   * Method called when the user leaves a meeting
   */
  #enterExitHall() {
    if (this.#currentRoom === this.#ROOM_NAMES.exitHall) {
      return;
    }
    this.#currentRoom = this.#ROOM_NAMES.exitHall;
    console.log('-ENTER-', this.#currentRoom);

    this.#resetButtons();
    this.#drawHueButtons();
    this.#drawButton(10, `rejoin`);
    this.#drawButton(14, `home`);

    if (this.#hueLights?.auto) {
      this.#hueLights.on(false);
    }
  }


  /**
   *
   * Helper methods to handle StreamDeck events.
   *
   */

  /**
   * Handle called when a button is pressed.
   *
   * @param {number} buttonId Button ID of the button that was pressed.
   */
  #handleStreamDeckPress(buttonId) {
    if (buttonId === 3) {
      this.#hueLights.on(true);
      return;
    } else if (buttonId === 4) {
      this.#hueLights.on(false);
      return;
    }

    if (this.#currentRoom === this.#ROOM_NAMES.lobby) {
      if (buttonId === 5) {
        this.#tapStartNextMeeting();
      } else if (buttonId === 6) {
        this.#tapStartInstantMeeting();
      }
      return;
    }

    if (this.#currentRoom === this.#ROOM_NAMES.greenRoom) {
      if (buttonId === 5) {
        this.#tapEnterMeeting();
      } else if (buttonId === 10) {
        this.#tapMic();
      } else if (buttonId === 11) {
        this.#tapCam();
      }
      return;
    }

    if (this.#currentRoom === this.#ROOM_NAMES.meeting) {
      if (buttonId === 5) {
        this.#tapUsers();
      } else if (buttonId === 6) {
        this.#tapChat();
      } else if (buttonId === 7) {
        this.#tapStopPresenting();
      } else if (buttonId === 10) {
        this.#tapMic();
      } else if (buttonId === 11) {
        this.#tapCam();
      } else if (buttonId === 12) {
        this.#tapHand();
      } else if (buttonId === 13) {
        this.#tapCC();
      } else if (buttonId === 14) {
        this.#tapHangUp();
      }
      return;
    }

    if (this.#currentRoom === this.#ROOM_NAMES.exitHall) {
      if (buttonId === 10) {
        this.#tapRejoin();
      } else if (buttonId === 14) {
        this.#tapHome();
      }
      return;
    }
  }


  /**
   *
   * Helper methods for drawing icons on the StreamDeck buttons
   *
   */

  /**
   * Draw an icon on the StreamDeck in the specified location.
   *
   * @param {number} buttonId Button index to draw icon on
   * @param {string} iconName Name of icon to draw
   */
  #drawButton(buttonId, iconName) {
    if (!this.#streamDeck?.isConnected) {
      return;
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
   * If Hue is available, draw the Hue buttons.
   */
  #drawHueButtons() {
    if (!this.#streamDeck?.isConnected) {
      return;
    }
    if (!this.#hueLights) {
      return;
    }
    this.#drawButton(3, `light-on`);
    this.#drawButton(4, `light-off`);
  }


  /**
   *
   * TODO.
   *
   */

  /**
   * Setup the Hand Raised button.
   */
  #setupHandButton() {
    this.#handButtonReady = true;
    const handObserver = new MutationObserver(() => {
      this.#updateHandState();
    });
    const handButton = this.#getHandButton();
    handObserver.observe(handButton, {attributeFilter: ['class']});
    this.#updateHandState();
  }

  /**
   * Setup the Closed Caption button.
   */
  #setupCCButton() {
    this.#ccButtonReady = true;
    const ccObserver = new MutationObserver(() => {
      this.#updateCCState();
    });
    const ccButton = this.#getCCButton();
    ccObserver.observe(ccButton, {attributeFilter: ['class']});
    this.#updateCCState();
  }


  /**
   *
   * Helper methods that check the state of the meeting and update buttons.
   *
   */

  /**
    * Add/remove the Stop Presenting button.
    */
  #updateIsPresenting() {
    const newVal = this.#getStopPresentingButton() ? true : false;
    if (this.#isPresenting === newVal) {
      return;
    }
    this.#isPresenting = newVal;
    const icon = newVal ? 'present-stop' : 'blank';
    this.#drawButton(7, icon);
  }

  /**
   * Update the mic muted/unmuted button.
   */
  async #updateIsMicMuted() {
    const button = this.#getMicButton();
    const newVal = button?.dataset?.isMuted == 'true';
    if (button) {
      const img = newVal ? 'mic-disabled' : 'mic';
      this.#drawButton(10, img);
    }
  }

  /**
   * Update the camera enabled/disabled button.
   */
  async #updateIsCamMuted() {
    const button = this.#getCamButton();
    if (button) {
      const img = button.dataset.isMuted == 'true' ? 'cam-disabled' : 'cam';
      this.#drawButton(11, img);
    }
  }

  /**
   * Update the hand raised button when the hand is raised/lowered.
   */
  async #updateHandState() {
    const elem = this.#getHandButton();
    if (elem) {
      const img = elem.classList.contains('SNTzF') ? 'hand-raised' : 'hand';
      this.#drawButton(12, img);
    }
  }

  /**
   * Update the closed caption button when CC are toggled.
   */
  async #updateCCState() {
    const elem = this.#getCCButton();
    if (elem) {
      const img = elem.classList.contains('o7y9G') ? 'cc-on' : 'cc';
      this.#drawButton(13, img);
    }
  }

  /**
   * Update the Chat and Attendees buttons when the panel is toggled.
   */
  #updateSidePanel() {
    const picker = document.querySelector('[jsname=I0Fcpe]');

    const selected = picker?.querySelector('[aria-selected=true]');
    const selectedId = selected?.getAttribute('data-tab-id');

    const userIcon = selectedId == '1' ? 'users-open' : 'users';
    this.#drawButton(5, userIcon);

    const chatIcon = selectedId == '2' ? 'chat-open' : 'chat';
    this.#drawButton(6, chatIcon);
  }


  /**
   *
   * Helper methods to get Meet UI elements.
   *
   */

  /**
   * Gets the bottom bar in a meeting
   *
   * @return {?Element}
   */
  #getStatusBar() {
    return document.querySelector('[jsname=EaZ7Cc]');
  }

  /**
   * Gets the Mic button.
   *
   * @return {?Element}
   */
  #getMicButton() {
    return document.querySelector('[jsname=Dg9Wp]')?.firstChild;
  }

  /**
 * Gets the Cam button.
 *
 * @return {?Element}
 */
  #getCamButton() {
    return document.querySelector('[jsname=R3GXJb]')?.firstChild;
  }

  /**
   * Gets the Hand button container.
   *
   * @return {?Element}
   */
  #getHandButton() {
    return document.querySelector('.p2SYhf');
  }

  /**
   * Gets the Hand button container.
   *
   * @return {?Element}
   */
  #getCCButton() {
    return document.querySelector('.Q8K3Le');
  }

  /**
   * Gets the Stop Presenting button.
   *
   * @return {?Element}
   */
  #getStopPresentingButton() {
    return document.querySelector('[jsname=PTpBtc]');
  }


  /**
   *
   * Helper methods interact with Meet UI elements.
   *
   */

  /**
   * Clicks an element.
   *
   * @param {string} querySelector Query selector of the element to click.
   */
  #tapElement(querySelector) {
    const elem = document.querySelector(querySelector);
    if (elem) {
      elem.click();
    }
  }

  /**
   * Starts an instant meeting (from the landing page).
   */
  #tapStartInstantMeeting() {
    this.#tapElement('[jsname=CuSyi]');
  }

  /**
   * Joins the next scheduled meeting (from the landing page)).
   */
  #tapStartNextMeeting() {
    this.#tapElement('[data-default-focus=true]');
  }

  /**
   * Enters meeting from green room.
   */
  #tapEnterMeeting() {
    this.#tapElement('[jsname=Qx7uuf]');
  }

  /**
   * Taps the mic button to mute/unmute.
   */
  #tapMic() {
    const button = this.#getMicButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the camera button, to mute/unmute.
   */
  #tapCam() {
    const button = this.#getCamButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the handup button, to toggle the hand state.
   */
  #tapHand() {
    const button = this.#getHandButton()?.firstChild;
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the CC button, to toggle the captions.
   */
  #tapCC() {
    const button = this.#getCCButton()?.firstChild;
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the close button on the side panel.
   */
  #tapClosePanel() {
    this.#tapElement('[jscontroller=soHxf]');
  }

  /**
   * Taps the Users button, to toggle the list of users.
   */
  #tapUsers() {
    const panelElem = document.querySelector('[jsname=Yz8Ubc]');
    const userButton = document.querySelector('[data-tab-id="1"]');

    if (panelElem && userButton.getAttribute('aria-selected') == 'true') {
      this.#tapClosePanel();
    } else {
      userButton.click();
    }
  }

  /**
   * Taps the Chat button, to toggle the chat panel.
   */
  #tapChat() {
    const panelElem = document.querySelector('[jsname=Yz8Ubc]');
    const chatButton = document.querySelector('[data-tab-id="2"]');

    if (panelElem && chatButton.getAttribute('aria-selected') == 'true') {
      this.#tapClosePanel();
    } else {
      chatButton.click();
    }
  }

  /**
   * Taps the stop presenting button.
   */
  #tapStopPresenting() {
    const button = this.#getStopPresentingButton();
    if (button) {
      button.click();
    }
  }

  /**
   * Taps the Hang Up button, to end the call.
   */
  #tapHangUp() {
    this.#tapElement('[jsname=CQylAd]');
  }

  /**
   * Taps the Rejoin button on the exit page.
   */
  #tapRejoin() {
    this.#tapElement('[jsname=oI7Fj] [role=button]');
  }

  /**
   * Taps the Return to Home Screen button on the exit page.
   */
  #tapHome() {
    this.#tapElement('[jsname=WIVZEd] [role=button]');
  }
}
