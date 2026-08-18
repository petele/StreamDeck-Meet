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
  // Index into #ADJUST_VIEW_OPTIONS for the "adjust view" cycle button.
  // Starts at -1 so the first press selects the first option.
  #adjustViewIndex = -1;

  // True while an adjust-view operation (open menu -> open panel -> select
  // option -> wait for close) is in flight. A second press must never
  // start while the previous panel is still closing: interrupting the
  // close animation wedges Meet's overlay manager and the three-dot menu
  // stops opening altogether.
  #adjustViewBusy = false;

  // Index of the highlighted meeting card in the lobby (see
  // #getLobbyMeetingCards). The tab button moves this, the select button
  // activates the card at this index. Wraps around in both directions.
  #lobbyHighlightIndex = 0;

  // Set once the user has pressed tab in the current lobby visit; stops
  // the initial-ring retry loop from clobbering the highlight.
  #lobbyHighlightTouched = false;

  // The "Adjust view" submenu (under the three-dot "More options" menu)
  // offers several ways to frame the participants. These are cycled in
  // order by the adjust-view button. The strings below are matched against
  // the menu item text (case-insensitive substring), so "Auto" matches the
  // "Auto frame" item. Add more entries to cycle through more options, and
  // update them if Google ever renames the menu items.
  #ADJUST_VIEW_OPTIONS = ['Spotlight', 'Auto'];

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

    // Google Meet's lobby page has moved over time (/ -> /landing -> /home),
    // so accept all known paths. The green room, meeting, and exit hall are
    // all served from the meeting URL and reached either as a fresh document
    // load (lobby -> green room) or as same-document updates (green room ->
    // meeting -> exit hall). We therefore detect the room both once up front
    // and continuously via a mutation observer: on a fresh load the room's
    // DOM is often already present before any mutation fires, so the observer
    // alone would never run and the green room would go undetected.
    const pathname = window.location.pathname;
    const isLobby = pathname === '/' || pathname === '/landing' ||
        pathname === '/home';

    const handleRoom = () => {
      const room = this.#detectRoom();
      if (room === this.#ROOM_NAMES.exitHall) {
        this.#enterExitHall();
      } else if (room === this.#ROOM_NAMES.meeting) {
        this.#enterMeeting();
      } else if (room === this.#ROOM_NAMES.greenRoom) {
        this.#enterGreenRoom();
      } else if (isLobby) {
        this.#enterLobby();
      }
    };

    // Detect immediately, then keep watching. Every #enter* method is
    // idempotent, so re-running this on each mutation is safe.
    handleRoom();

    const bodyObserver = new MutationObserver(handleRoom);
    bodyObserver.observe(document.body, {attributes: true, childList: true});
  }

  /**
   * Determine which "room" the current page is in, based on stable
   * markers in the DOM. Returns one of the #ROOM_NAMES values, or null
   * if no known room is detected.
   *
   * The exit hall is checked first because its heading is unique to that
   * screen; the meeting is checked before the green room because the
   * green room's "Join" button can look similar to meeting controls.
   *
   * @return {?string}
   */
  #detectRoom() {
    // A hang-up control is only present while actually in a call. It is
    // the strongest "in meeting" signal, so grab it up front: while it is
    // on screen we can NEVER be in the exit hall, no matter what other
    // markers are in the DOM.
    const hangup = document.querySelector(
        '[aria-label="Leave call"], [aria-label="End call for everyone"]');

    // Exit hall: the "You left the meeting" heading. Do NOT match on
    // [jsname="r4nke"] alone — short jsname hashes are reused by
    // unrelated components in lazily-loaded chunks (opening the
    // "Adjust view" panel used to add such an element and flip the
    // detected room to exit hall mid-meeting). Require the h1 tag AND
    // the heading text, and never report the exit hall while a hang-up
    // control is visible.
    if (!hangup) {
      const h1 = document.querySelector('h1[jsname="r4nke"]');
      if (h1 && /left the meeting/i.test(h1.textContent || '')) {
        return this.#ROOM_NAMES.exitHall;
      }
    }

    // Green room is checked BEFORE the meeting: its "Join now" / "Join
    // without camera" button is unique to the green room, whereas the
    // meeting's markers (a hang-up control or a runtime-injected
    // [data-meeting-title]) can also be present in the green room's live
    // preview. Checking the green room first avoids mis-detecting it as a
    // meeting, which is what made the join button disappear.
    const join = this.#findButtonByText(
        ['Join now', 'Join without camera', 'Join with camera']);
    if (join || document.querySelector('[jscontroller="dyDNGc"]')) {
      return this.#ROOM_NAMES.greenRoom;
    }

    // Meeting: a hang-up control is only present while in a call.
    if (hangup || document.querySelector('div[data-meeting-title]')) {
      return this.#ROOM_NAMES.meeting;
    }

    return null;
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

    // TEMPORARILY DISABLED (see #tapLobbyTab): un-iconed tab/select keys.
    // this.#lobbyHighlightIndex = 0;
    // this.#lobbyHighlightTouched = false;
    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`start-next`);
    this.#drawButton(`start-instant`);

    // TEMPORARILY DISABLED: initial highlight-ring for the tab/select keys.
    // for (let attempt = 0; attempt < 10; attempt++) {
    //   setTimeout(() => {
    //     if (this.#currentRoom === this.#ROOM_NAMES.lobby &&
    //         !this.#lobbyHighlightTouched &&
    //         this.#lobbyHighlightIndex === 0) {
    //       const card = this.#getHighlightedLobbyCard();
    //       if (card) {
    //         this.#setLobbyHighlightRing(card);
    //       }
    //     }
    //   }, 300 * (attempt + 1));
    // }
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
    console.log('*SD-Meet*', 'Room:', this.#currentRoom);

    // Each new meeting starts the "adjust view" cycle from the beginning.
    this.#adjustViewIndex = -1;

    this.#resetButtons();
    this.#drawFullScreenButton();
    this.#drawButton(`end-call`);
    // Adjust view is temporarily disabled (see the matching commented-out
    // press handler in #handleStreamDeckPress and #tapAdjustView below).
    // Re-enable both together.
    // this.#drawButton(`adjust-view`);

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
      this.#setupReactionButton();
    }, 500);

    // If it was an instant meeting, automatically close
    // the info dialog after 10 seconds.
    setTimeout(() => {
      this.#tapCloseInfoDialog();
    }, 10 * 1000);
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
      // TEMPORARILY DISABLED (see #tapLobbyTab):
      // if (buttonId === this.#streamDeck.buttonNameToId('select')) {
      //   this.#tapLobbySelect();
      // } else if (buttonId === this.#streamDeck.buttonNameToId('tab')) {
      //   this.#tapLobbyTab();
      // } else if (buttonId === this.#streamDeck.buttonNameToId('start-next')) {
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
      if (buttonId === this.#streamDeck.buttonNameToId('escape')) {
        this.#dismissOpenMenus();
      } else if (buttonId === this.#streamDeck.buttonNameToId('reaction')) {
        this.#tapReactions();
        // Adjust view is temporarily disabled; re-enable together with the
        // drawButton call in #enterMeeting.
        // } else if (buttonId === this.#streamDeck.buttonNameToId('adjust-view')) {
        //   this.#tapAdjustView();
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
    const newVal = this.#isToggled(button);
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
    const newVal = this.#isToggled(button);
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
    const newVal = this.#isToggled(button);
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
    const newVal = this.#isToggled(button);
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
    const newVal = this.#isToggled(button);
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
    const newVal = this.#isToggled(button);
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
   * Update the StreamDeck Send a Reaction button to indicate current state.
   */
  #updateReactionButton() {
    const button = this.#getReactionButton();
    if (!button) {
      return;
    }
    const newVal = this.#isToggled(button);
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
   * Generic helpers for finding and inspecting Meet UI elements. The
   * redesigned interface dropped many of the old jscontroller wrapper
   * ids, so these fall back to stable, human-readable attributes
   * (aria-label, data-is-muted, data-panel-id) and visible text.
   *
   */

  /**
   * Return the first element matching any of the given CSS selectors,
   * or null. Used to layer new-interface selectors on top of legacy
   * ones so the wrapper keeps working across Meet UI revisions.
   *
   * @param {string[]} selectors Selectors to try, in priority order.
   * @return {?Element}
   */
  #firstMatch(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        return el;
      }
    }
    return null;
  }

  /**
   * Find a clickable element (button or div[role=button]) whose visible
   * text or aria-label matches one of the given strings.
   *
   * @param {string[]} texts Candidate texts to match (case-insensitive).
   * @return {?Element}
   */
  #findButtonByText(texts) {
    const candidates = document.querySelectorAll(
        'button, [role="button"], [role="menuitem"], [role="tab"]');
    // Two passes so an exact match always wins. In the new UI a wrapper
    // [role=button] can *contain* the target text (e.g. "Rejoin") while the
    // real clickable button is nested inside it; matching by substring on
    // the first element in document order would grab the wrong, outer node.
    const match = (el, exact) => {
      const label = (el.getAttribute('aria-label') || '').trim();
      const text = (el.textContent || '').trim();
      for (const t of texts) {
        if (exact) {
          if (label === t || text === t) {
            return true;
          }
        } else if (label.toLowerCase().includes(t.toLowerCase()) ||
            text.toLowerCase().includes(t.toLowerCase())) {
          return true;
        }
      }
      return false;
    };
    for (const el of candidates) {
      if (match(el, true)) {
        return el;
      }
    }
    for (const el of candidates) {
      if (match(el, false)) {
        return el;
      }
    }
    return null;
  }

  /**
   * Find the clickable control for a side panel by its data-panel-id.
   * In the new interface the id can sit on a wrapper element rather than
   * the clickable one, so resolve to the inner button if needed.
   *
   * @param {string} panelId The data-panel-id value (e.g. "1").
   * @return {?Element}
   */
  #getPanelButton(panelId) {
    // In the new UI the panel id can appear on more than one element: the
    // control-bar toggle (a real button / role=button) AND the side-panel
    // container div. We must return the toggle, so scan every match and
    // prefer the one that is itself clickable; only fall back to digging
    // inside a wrapper if no match is a button on its own.
    const els = document.querySelectorAll(`[data-panel-id="${panelId}"]`);
    let fallback = null;
    for (const el of els) {
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        return el;
      }
      if (!fallback) {
        fallback = el;
      }
    }
    if (fallback) {
      return fallback.querySelector('button, [role="button"]');
    }
    return null;
  }

  /**
   * Determine if a toggle-style control is currently in its "on"/open
   * state. Meet uses either aria-pressed (icon toggles) or
   * aria-expanded (side panel buttons) depending on the control.
   *
   * @param {Element} el
   * @return {boolean}
   */
  #isToggled(el) {
    if (!el) {
      return false;
    }
    return el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-expanded') === 'true';
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
    return this.#firstMatch([
      '[jsname="CuSyi"]',
      '[aria-label="Start an instant meeting"]',
    ]);
  }

  /**
   * Get the Start Next Meeting button (lobby).
   *
   * @return {?Element}
   */
  #getStartNextMeetingButton() {
    // The new lobby (/home) marks every *joinable* meeting card with a
    // hidden <span data-unused-join="ucc-N"> inside a
    // jscontroller="GxOwhc" wrapper that also holds the real Join
    // <button>. Past meetings lack the marker, so scanning for it
    // reliably picks a joinable card even when past meetings appear
    // earlier in the DOM.
    for (const marker of document.querySelectorAll('[data-unused-join]')) {
      const wrapper = marker.closest('[jscontroller="GxOwhc"]') ||
          marker.parentElement;
      const button = wrapper?.querySelector('button');
      if (button) {
        return button;
      }
    }

    // Legacy lobby marked the first scheduled card directly.
    const focused = document.querySelector('[data-default-focus="true"]');
    if (focused) {
      return focused.tagName === 'BUTTON' ? focused : focused.querySelector('button');
    }

    // Last resort: first visible "Join" button.
    return this.#findButtonByText(['Join']);
  }

  /**
   * TEMPORARILY DISABLED: lobby tab/select keys (see #enterLobby and
   * #handleStreamDeckPress). The whole block of methods below
   * (#getLobbyMeetingCards, #getHighlightedLobbyCard,
   * #getLobbyCardInteractiveElement, #setLobbyHighlightRing, #tapLobbyTab,
   * #tapLobbySelect) is kept for a future revisit.
   *
   * Known unresolved issue (v1.3 logs): select resolved to the fhtj7 card
   * wrapper (div.u88fae, visible=false) instead of the Join button — the
   * [data-unused-join] lookup found no marker inside the live card, so
   * native click / pointer sequence / jsaction / Enter all fired on the
   * inert wrapper and nothing navigated. Manual Tab+Enter in the browser
   * works fine. Next things to try: the live card may use different
   * markers than the saved snapshots (data-unused-join may be added later
   * by a controller — retry/observe), or drive focus() through the card's
   * focusable descendant, or dispatch events with composed:true from
   * document.activeElement.
   *
   * Get all meeting cards in the lobby, in visual order: the upcoming /
   * current cards first (they carry a data-unused-join marker), then the
   * cards in the "Past" section. Used by the tab/select keys to move a
   * highlight between meetings the same way Tab+Enter does by hand.
   *
   * @return {!Element[]} fhtj7 card wrappers.
   */
  #getLobbyMeetingCards() {
    const cards = [];
    const push = (el) => {
      if (el && !cards.includes(el)) {
        cards.push(el);
      }
    };

    // Upcoming/current meetings: each card has a hidden data-unused-join
    // marker; its fhtj7 wrapper carries the card's click handler.
    for (const marker of document.querySelectorAll('[data-unused-join]')) {
      push(marker.closest('[jscontroller="fhtj7"]'));
    }

    // Past meetings live in their own section (no data-unused-join).
    let pastSection = document.querySelector('section[jsname="IFO1Jf"]');
    if (!pastSection) {
      for (const section of document.querySelectorAll('section')) {
        const heading = section.querySelector('[role="heading"]');
        if (heading && heading.textContent.trim() === 'Past') {
          pastSection = section;
          break;
        }
      }
    }
    if (pastSection) {
      for (const card of pastSection.querySelectorAll('[jscontroller="fhtj7"]')) {
        push(card);
      }
    }

    return cards;
  }

  /**
   * The meeting card at the current lobby highlight index, if any.
   *
   * @return {?Element}
   */
  #getHighlightedLobbyCard() {
    const cards = this.#getLobbyMeetingCards();
    if (!cards.length) {
      return null;
    }
    return cards[this.#lobbyHighlightIndex % cards.length] || null;
  }

  /**
   * The card's actually-interactive element: for joinable meetings the
   * inner Join button (clicking the fhtj7 wrapper alone does nothing —
   * its jsaction is not triggered by our synthetic events), otherwise the
   * wrapper itself (past meetings: opens the meeting details/recording).
   *
   * @param {!Element} card An fhtj7 card wrapper.
   * @return {!Element}
   */
  #getLobbyCardInteractiveElement(card) {
    const joinMarker = card.querySelector('[data-unused-join]');
    if (joinMarker) {
      const joinArea = joinMarker.closest('[jscontroller="GxOwhc"]') || card;

      // 1) The marker's value is the id of a hidden "Join" label span that
      //    lives INSIDE the Material button -> climb to the button.
      const labelId = joinMarker.getAttribute('data-unused-join');
      const labelEl = labelId ? document.getElementById(labelId) : null;
      if (labelEl) {
        const btn = labelEl.closest('button, [role="button"], [class*="VfPpkd"]');
        if (btn && joinArea.contains(btn)) {
          return btn;
        }
      }

      // 2) The wrapper's jsaction names the button by jsname, e.g.
      //    jsaction="JIbuQc:oRCNsf(Dq2Egc)" -> [jsname="Dq2Egc"].
      const action = joinArea.getAttribute('jsaction') || '';
      const param = action.match(/\(([^)]+)\)/);
      if (param) {
        const btn = joinArea.querySelector(`[jsname="${param[1]}"]`);
        if (btn) {
          return btn;
        }
      }

      // 3) First Material button inside the join area.
      const material = joinArea.querySelector('[class*="VfPpkd"]');
      if (material) {
        return material;
      }
      return joinArea;
    }
    return card;
  }

  /**
   * Shows the visible highlight ring on the given card (the fhtj7 wrapper
   * is a plain div, so browser focus gives no visible cue of its own).
   *
   * @param {?Element} card
   */
  #setLobbyHighlightRing(card) {
    for (const el of document.querySelectorAll('[jscontroller="fhtj7"][data-sd-meet-highlight]')) {
      el.removeAttribute('data-sd-meet-highlight');
      el.style.boxShadow = '';
      el.style.outline = '';
      el.style.borderRadius = '';
    }
    if (card) {
      card.setAttribute('data-sd-meet-highlight', '1');
      card.style.boxShadow = '0 0 0 3px #8ab4f8';
      card.style.outline = '2px solid #8ab4f8';
      card.style.borderRadius = '8px';
    }
  }

  /**
   * TEMPORARILY DISABLED: replaced by the tab/select lobby keys (see
   * #enterLobby and #handleStreamDeckPress). Kept for reference.
   *
   * Get the clickable element for the most recent *past* meeting (lobby).
   *
   * In the /home lobby, past meetings are grouped in a "Past" section and,
   * unlike joinable/scheduled cards, they carry no data-unused-join marker.
   * The "previous" meeting is the last card in that section (closest to the
   * present). Returns the card's inner button if it has one, otherwise the
   * card wrapper itself, which is clickable to open/join the meeting.
   *
   * @return {?Element}
   */
  #getJoinPreviousMeetingButton() {
    // Find the "Past" section by its heading text (most durable across
    // redesigns), falling back to the known jsname.
    let pastSection = document.querySelector('section[jsname="IFO1Jf"]');
    if (!pastSection) {
      for (const section of document.querySelectorAll('section')) {
        const heading = section.querySelector('[role="heading"]');
        if (heading && heading.textContent.trim() === 'Past') {
          pastSection = section;
          break;
        }
      }
    }
    if (!pastSection) {
      return null;
    }

    // Each meeting card is wrapped in an fhtj7 controller that carries the
    // card's click handler; take the last one (most recent past meeting).
    // Fall back to the GxOwhc join-area wrapper if the layout changes.
    let cards = pastSection.querySelectorAll('[jscontroller="fhtj7"]');
    if (!cards.length) {
      cards = pastSection.querySelectorAll('[jscontroller="GxOwhc"]');
    }
    if (!cards.length) {
      return null;
    }
    const card = cards[cards.length - 1];

    // Prefer an explicit button inside the card; otherwise the card wrapper
    // itself is the clickable target (clicks bubble up, so we must click the
    // card or below, never its ancestor <li>).
    return card.querySelector('button') || card;
  }

  /**
   * Get the Join Meeting button (green room).
   *
   * @return {?Element}
   */
  #getEnterMeetingButton() {
    // In the new green room the join control is a div[role=button].
    const button = this.#findButtonByText(['Join now', 'Join without camera', 'Join with camera']);
    if (button) {
      return button;
    }
    return document.querySelector('[class=UywwFc-vQzf8d]');
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
    // In the new UI hw0c9 is the clickable div[role=button] itself, and
    // it carries data-is-muted directly. The legacy layout wrapped it in
    // an eB6kvd container with a nested button.
    return this.#firstMatch([
      '[jsname="hw0c9"]',
      '[jscontroller="eB6kvd"] button[data-is-muted]',
      '[role="button"][aria-label*="microphone"]',
    ]);
  }

  /**
   * Get the Camera button in the meeting room.
   *
   * @return {?Element}
   */
  #getCamButton() {
    // Same story as the mic button: psRWwc is the clickable element
    // itself in the new UI, with data-is-muted on it.
    return this.#firstMatch([
      '[jsname="psRWwc"]',
      '[jscontroller="bwqwSd"] button[data-is-muted]',
      '[role="button"][aria-label*="camera"]',
    ]);
  }

  /**
   * Get the CC button in the meeting room.
   *
   * @return {?Element}
   */
  #getCCButton() {
    // RrG0hf is the clickable div[role=button] in the new UI.
    return this.#firstMatch([
      '[jsname="RrG0hf"]',
      '[jscontroller="iBwifb"] button',
      '[aria-label*="captions"]',
    ]);
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
    return this.#firstMatch([
      '[jsname="aK5XXd"]',
      '[aria-label="Stop sharing"]',
    ]);
  }

  /**
   * Get the Info button in the meeting room.
   *
   * @return {?Element}
   */
  #getInfoButton() {
    // In the new UI data-panel-id sits on a wrapper div, not the button.
    return this.#getPanelButton('5') ?? document.querySelector('button[data-panel-id="5"]');
  }

  /**
   * Get the People button in the meeting room.
   *
   * @return {?Element}
   */
  #getPeopleButton() {
    // data-panel-id="1" was already missing in the pre-redesign UI, so
    // this is best-effort: prefer the panel attribute, then the label.
    return this.#getPanelButton('1') ?? this.#findButtonByText(['People']);
  }

  /**
   * Get the Chat button in the meeting room.
   *
   * @return {?Element}
   */
  #getChatButton() {
    return this.#getPanelButton('2') ?? document.querySelector('button[data-panel-id="2"]');
  }

  /**
   * Get the Activities button in the meeting room.
   *
   * @return {?Element}
   */
  #getActivitiesButton() {
    return this.#getPanelButton('10') ?? document.querySelector('button[data-panel-id="10"]');
  }

  /**
   * Gets the Send a reaction button in the meeting room.
   *
   * @return {?Element}
   */
  #getReactionButton() {
    return this.#firstMatch([
      '[jscontroller="M3NJxf"] button',
      '[jscontroller="M3NJxf"] [role="button"]',
      '[aria-label="Send a reaction"]',
    ]);
  }

  /**
   * Gets the Send a reaction bar in the meeting room.
   *
   * @return {?Element}
   */
  #getReactionBar() {
    const sel = '[jscontroller=tdX73b]';
    return document.querySelector(sel);
  }

  /**
   * Gets the send a reaction emoji button in the meeting room.
   *
   * @param {string} emoji Emoji to find
   * @return {?Element}
   */
  #getReactionEmojiButton(emoji) {
    const sel = `[aria-label=${emoji}]`;
    return document.querySelector(sel);
  }

  /**
   * Get the Hang Up button in the meeting room.
   *
   * @return {?Element}
   */
  #getHangupButton() {
    return this.#firstMatch([
      '[jscontroller="m1IMT"] button',
      '[aria-label="Leave call"]',
      '[aria-label="End call for everyone"]',
    ]);
  }

  /**
   * Get the Mic button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomMicButton() {
    // The green room reuses the same control as the meeting room.
    return this.#firstMatch([
      '[jsname="hw0c9"]',
      '[jscontroller="t2mBxb"] [role="button"]',
      '[role="button"][aria-label*="microphone"]',
    ]);
  }

  /**
   * Get the Camera button in the green room.
   *
   * @return {?Element}
   */
  #getGreenRoomCamButton() {
    // The green room reuses the same control as the meeting room.
    return this.#firstMatch([
      '[jsname="psRWwc"]',
      '[jscontroller="bwqwSd"] [role="button"]',
      '[role="button"][aria-label*="camera"]',
    ]);
  }

  /**
   * Get the Rejoin Meeting button in the exit hall.
   *
   * @return {?Element}
   */
  #getRejoinButton() {
    // The oI7Fj wrapper is gone in the new UI, so match by label first.
    return this.#findButtonByText(['Rejoin']) ?? document.querySelector('[jsname="oI7Fj"] button');
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
   * TEMPORARILY DISABLED: replaced by the tab/select lobby keys.
   */
  #tapJoinPreviousMeeting() {
    const button = this.#getJoinPreviousMeetingButton();
    this.#tapButtonWrapper(button, 'joinPrevious');
  }

  /**
   * Moves the lobby highlight to the next meeting card (wraps around),
   * like pressing Tab on the home page. A blue ring marks the highlighted
   * card, and the card's interactive element is focused.
   */
  #tapLobbyTab() {
    const cards = this.#getLobbyMeetingCards();
    if (!cards.length) {
      console.warn('*SD-Meet*', 'No meeting cards found in lobby');
      return;
    }
    this.#lobbyHighlightIndex = (this.#lobbyHighlightIndex + 1) % cards.length;
    this.#lobbyHighlightTouched = true;
    const card = cards[this.#lobbyHighlightIndex];
    const label = (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    console.log('*SD-Meet*', `Lobby tab ${this.#lobbyHighlightIndex + 1}/${cards.length}: "${label}"`);
    this.#setLobbyHighlightRing(card);
    try {
      this.#getLobbyCardInteractiveElement(card).focus();
    } catch (ex) {
      // Not focusable; the ring still marks the highlight.
    }
  }

  /**
   * Activates the currently highlighted lobby meeting card, like pressing
   * Enter on the home page. Joins a joinable meeting (clicks its Join
   * button), or opens the details/recording of a past one. If the click
   * doesn't navigate, an Enter keydown is sent as a fallback.
   */
  #tapLobbySelect() {
    const cards = this.#getLobbyMeetingCards();
    if (!cards.length) {
      console.warn('*SD-Meet*', 'No meeting cards found in lobby');
      return;
    }
    const card = cards[this.#lobbyHighlightIndex % cards.length];
    const label = (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const target = this.#getLobbyCardInteractiveElement(card);
    const targetDesc = `${target.tagName.toLowerCase()}[class="${
        (target.getAttribute('class') || '').split(' ').slice(0, 2).join(' ')}"]` +
        (target.getAttribute('jsname') ? ` jsname=${target.getAttribute('jsname')}` : '') +
        ` "${(target.textContent || '').trim().slice(0, 30)}"`;
    const visibility = target.checkVisibility ?
        target.checkVisibility() : target.offsetParent !== null;
    console.log('*SD-Meet*', `Lobby select: "${label}" -> ${targetDesc}` +
        ` visible=${!!visibility} disabled=${target.disabled}`);

    // Try several activation paths in order; stop as soon as we leave the
    // lobby. 1) native click, 2) full pointer sequence, 3) Google's
    // internal jsaction dispatcher (data-jsh), 4) Enter keydown.
    const stillInLobby = () =>
        this.#currentRoom === this.#ROOM_NAMES.lobby && target.isConnected;

    try {
      target.focus();
    } catch (ex) {
      // Not focusable.
    }
    target.click();
    setTimeout(() => {
      if (!stillInLobby()) {
        return;
      }
      console.log('*SD-Meet*', 'Lobby select: .click() did not navigate, trying pointer sequence');
      this.#robustClick(target);
    }, 500);
    setTimeout(() => {
      if (!stillInLobby()) {
        return;
      }
      console.log('*SD-Meet*', 'Lobby select: pointer sequence did not navigate, trying jsaction');
      const jsh = target.getAttribute('data-jsh') || '';
      const action = target.getAttribute('jsaction') || '';
      const jshMap = {};
      for (const part of jsh.split(';')) {
        const [key, val] = part.split(':');
        if (key && val) {
          jshMap[key] = val;
        }
      }
      // jsaction is "event:actionName;..."; we only want the click one.
      for (const pair of action.split(';')) {
        const [event, name] = pair.split(':');
        if (event === 'click' && name) {
          const internal = jshMap[name];
          if (internal && typeof window[internal] === 'function') {
            try {
              window[internal](target, {});
            } catch (ex) {
              console.warn('*SD-Meet*', `jsaction ${internal} threw:`, ex);
            }
          } else {
            console.warn('*SD-Meet*',
                `jsaction click "${name}" -> "${internal}" not callable`);
          }
        }
      }
    }, 1200);
    setTimeout(() => {
      if (!stillInLobby()) {
        return;
      }
      console.log('*SD-Meet*', 'Lobby select: jsaction did not navigate, trying Enter');
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }));
      target.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }));
    }, 1900);
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
   * Get the "More options" (three-dot) menu in the bottom control bar.
   *
   * The video feed also has a "More options" button on every participant
   * tile, so taking the first match in document order lands on a tile menu
   * (which has no "Adjust view" item). We anchor on the hang-up button, which
   * only exists in the control bar, and walk up to the nearest ancestor that
   * also holds a "More options" button — that ancestor is the control bar.
   *
   * @return {?Element}
   */
  #getMoreOptionsMenu() {
    const hangup = document.querySelector(
        '[aria-label="Leave call"], [aria-label="End call for everyone"]');
    if (hangup) {
      let el = hangup.parentElement;
      while (el && el !== document.body) {
        const more = el.querySelector('[aria-label*="More options"]');
        if (more) {
          return more;
        }
        el = el.parentElement;
      }
    }
    // Fallback if the hang-up button isn't present.
    return document.querySelector('[aria-label*="More options"]');
  }

  /**
   * Find a clickable item in the currently-open menu/panel. Searches the
   * most recently opened menu container first (last in document order), so
   * items with the same text in other open menus (e.g. a participant tile's
   * "Spotlight") can't be matched by mistake. Falls back to the whole
   * document if no menu container is found.
   *
   * @param {string[]} texts Candidate texts to match.
   * @return {?Element}
   */
  #findOpenMenuItem(texts) {
    const isVisible = (el) =>
        (el.checkVisibility ? el.checkVisibility() :
            el.offsetParent !== null || el.getClientRects().length > 0);
    const menus = Array.from(document.querySelectorAll(
        '[role="menu"], [role="listbox"], [role="dialog"], [role="presentation"]'))
        .filter(isVisible);

    const searchIn = (scope) => {
      const candidates = scope.querySelectorAll(
          'button, [role="button"], [role="menuitem"], [role="menuitemradio"], ' +
          '[role="option"], [role="tab"], [role="radio"], [role="switch"], ' +
          'input[type="radio"], input[type="checkbox"], label');
      // Exact match first.
      for (const el of candidates) {
        const label = (el.getAttribute('aria-label') || '').trim();
        const text = (el.textContent || '').trim();
        for (const t of texts) {
          if (label === t || text === t) {
            return el;
          }
        }
      }
      // Then substring.
      for (const el of candidates) {
        const label = (el.getAttribute('aria-label') || '').trim();
        const text = (el.textContent || '').trim();
        for (const t of texts) {
          if (label.toLowerCase().includes(t.toLowerCase()) ||
              text.toLowerCase().includes(t.toLowerCase())) {
            return el;
          }
        }
      }
      return null;
    };

    // Prefer the most recently opened menu (last in document order) so an
    // identically-named item in another open menu can't be matched. If that
    // scope has nothing, fall back to the whole document.
    if (menus.length) {
      const el = searchIn(menus[menus.length - 1]);
      if (el) {
        return el;
      }
    }
    return searchIn(document);
  }

  /**
   * Repeatedly try to find an open-menu item while it renders.
   *
   * @param {string[]} texts Candidate texts to match.
   * @param {number} attempts Max number of polls.
   * @param {number} intervalMs Delay between polls.
   * @param {Function} onFound Called with the found element.
   * @param {Function} onGiveUp Called if nothing was found in time.
   */
  #waitOpenMenuItem(texts, attempts, intervalMs, onFound, onGiveUp) {
    let tries = 0;
    const poll = () => {
      const el = this.#findOpenMenuItem(texts);
      if (el) {
        onFound(el);
        return;
      }
      tries++;
      if (tries >= attempts) {
        onGiveUp();
        return;
      }
      setTimeout(poll, intervalMs);
    };
    poll();
  }

  /**
   * Ask the page to close whatever menu/panel is open.
   */
  #dismissOpenMenus() {
    // Some Meet menus listen for Escape on document, others on body or on
    // themselves; dispatch to all three so at least one handler catches it.
    for (const target of [document, document.body]) {
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true,
      }));
      target.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true,
      }));
    }
    // Fallback: toggle any open menu closed via its aria-expanded control.
    const isVisible = (el) =>
        (el.checkVisibility ? el.checkVisibility() :
            el.offsetParent !== null || el.getClientRects().length > 0);
    const menus = Array.from(document.querySelectorAll(
        '[role="menu"], [role="listbox"]')).filter(isVisible);
    for (const m of menus) {
      this.#clickAncestorWithAriaExpanded(m);
    }
  }

  /**
   * All currently visible menu/panel containers, in document order.
   */
  #getVisibleMenus() {
    const isVisible = (el) =>
        (el.checkVisibility ? el.checkVisibility() :
            el.offsetParent !== null || el.getClientRects().length > 0);
    return Array.from(document.querySelectorAll(
        '[role="menu"], [role="listbox"], [role="dialog"], [role="presentation"]'))
        .filter(isVisible);
  }

  /**
   * Wait for the "Adjust view" panel to fully close after an option has
   * been selected. Selecting the option does not always dismiss the panel
   * by itself, and letting a new press (or its pre-press Escape) interrupt
   * the panel's close animation used to leave Meet's overlay manager
   * wedged, after which the three-dot menu never opened again. So: send
   * Escape, then poll until no menu/panel is visible any more, and only
   * then call onDone (which clears the busy flag). If the panel refuses
   * to close, toggle the three-dot menu and try once more; onDone is
   * always eventually called so the button can never stay locked out.
   */
  #waitForPanelClosed(moreButton, onDone) {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        onDone();
      }
    };

    setTimeout(() => {
      this.#dismissOpenMenus();
      let tries = 0;
      const poll = () => {
        if (this.#getVisibleMenus().length === 0) {
          finish();
          return;
        }
        tries++;
        if (tries < 15) {
          setTimeout(poll, 150);
          return;
        }
        // Still open: toggle the three-dot menu and Escape once more.
        console.warn('*SD-Meet*', 'Adjust view panel still open, toggling menu closed');
        if (moreButton && moreButton.isConnected) {
          this.#robustClick(moreButton);
        }
        this.#dismissOpenMenus();
        setTimeout(() => {
          if (this.#getVisibleMenus().length > 0) {
            console.warn('*SD-Meet*', 'Adjust view panel would not close');
          }
          finish();
        }, 600);
      };
      setTimeout(poll, 450);
    }, 350);
  }

  /**
   * Click the nearest ancestor of el that has an aria-expanded attribute
   * (the menu toggle button). Used to close a menu by toggling it.
   */
  #clickAncestorWithAriaExpanded(el) {
    let node = el;
    for (let i = 0; i < 12 && node; i++) {
      if (node.getAttribute && node.getAttribute('aria-expanded') !== null) {
        this.#robustClick(node);
        return;
      }
      node = node.parentElement;
    }
  }

  /**
   * Log the visible text of every currently open menu/panel. Used on
   * failure so the console shows exactly what the page rendered.
   */
  #dumpOpenMenus() {
    const isVisible = (el) =>
        (el.checkVisibility ? el.checkVisibility() :
            el.offsetParent !== null || el.getClientRects().length > 0);
    const menus = Array.from(document.querySelectorAll(
        '[role="menu"], [role="listbox"], [role="dialog"], ' +
        '[role="presentation"]')).filter(isVisible);
    if (!menus.length) {
      console.warn('*SD-Meet*', 'No open menus/panels found.');
      return;
    }
    for (const m of menus) {
      const role = m.getAttribute('role') || m.tagName.toLowerCase();
      const text = (m.textContent || '').replace(/\s+/g, ' ').trim();
      console.warn(`*SD-Meet* Open ${role}: "${text.slice(0, 600)}"`);
    }
  }

  /**
   * "Poke" the control bar so auto-hide reveals it. Meet fades the control
   * bar out after a few seconds of mouse inactivity; since the Stream Deck
   * never moves the mouse, the bar is usually hidden by the time a button
   * is pressed. A synthetic mouse move over the bar (dispatched on document
   * so it hit-tests like a real one) restarts the auto-hide timer and makes
   * the bar's buttons clickable again.
   */
  #pokeControlBar(el) {
    const rect = el.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = {bubbles: true, cancelable: true, view: window, clientX: x, clientY: y};
    document.dispatchEvent(new PointerEvent('pointermove', opts));
    document.dispatchEvent(new MouseEvent('mousemove', opts));
  }

  /**
   * Click an element with the full pointer/mouse event sequence. Some
   * Material UI components only react to a real-looking click, not a
   * bare el.click().
   */
  #robustClick(el) {
    const opts = {bubbles: true, cancelable: true, view: window};
    el.dispatchEvent(new PointerEvent('pointerover', opts));
    el.dispatchEvent(new PointerEvent('pointerenter', {
      bubbles: false, cancelable: false, view: window,
    }));
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  /**
   * TEMPORARILY DISABLED: the button is no longer drawn or wired up (see
   * #enterMeeting and #handleStreamDeckPress). The implementation below is
   * kept for a future revisit. Known remaining issue: after the first
   * successful selection, subsequent clicks on the three-dot menu button
   * do not open the menu; the leading suspect is Meet's control-bar
   * auto-hide (see #pokeControlBar), which the synthetic mouse-move poke
   * did not fully resolve.
   *
   * Cycles the "Adjust view" option (meeting room). Each press advances to
   * the next option in #ADJUST_VIEW_OPTIONS, opens the three-dot "More
   * options" menu, opens the "Adjust view" submenu, and selects that option.
   * If anything fails, Escape is sent so no panel is left stuck open.
   */
  #tapAdjustView() {
    if (this.#adjustViewBusy) {
      console.warn('*SD-Meet*', 'Adjust view still settling, ignoring press');
      return;
    }
    this.#adjustViewBusy = true;
    const count = this.#ADJUST_VIEW_OPTIONS.length;
    this.#adjustViewIndex = (this.#adjustViewIndex + 1) % count;
    const option = this.#ADJUST_VIEW_OPTIONS[this.#adjustViewIndex];
    console.log('*SD-Meet*', 'Adjust view ->', option);

    const finish = () => {
      this.#adjustViewBusy = false;
    };

    const fail = (what) => {
      console.warn('*SD-Meet*', what);
      this.#dumpOpenMenus();
      // Close the stuck panel so the Stream Deck stays usable, and
      // re-attempt the same option on the next press.
      this.#dismissOpenMenus();
      this.#adjustViewIndex--;
      finish();
    };

    const moreButton = this.#getMoreOptionsMenu();
    if (!moreButton) {
      fail('Unable to find "More options" menu');
      return;
    }
    // If a previous press left a menu/panel open, close it first so this
    // press starts from a clean state.
    this.#dismissOpenMenus();

    const openMenu = (attemptsLeft) => {
      setTimeout(() => {
        // The control bar may have been re-created by a re-render since
        // we resolved the button; re-resolve if it went away.
        const button = moreButton.isConnected ? moreButton :
            this.#getMoreOptionsMenu();
        if (!button) {
          fail('Unable to find "More options" menu');
          return;
        }
        console.log('*SD-Meet*', `Opening more-options menu (attempt ` +
            `${3 - attemptsLeft + 1}/3)`);
        const visible = button.checkVisibility ?
            button.checkVisibility() : button.offsetParent !== null;
        if (!visible) {
          // The control bar is auto-hidden; a hidden bar's menu button
          // won't open its menu, so wake the bar first, then re-resolve
          // (in case the re-render swapped the element) and click.
          console.log('*SD-Meet*', 'More-options button hidden, poking control bar');
          this.#pokeControlBar(button);
          setTimeout(() => {
            const live = button.isConnected ? button :
                this.#getMoreOptionsMenu();
            if (!live) {
              fail('Unable to find "More options" menu');
              return;
            }
            this.#robustClick(live);
            this.#openAdjustViewMenu(live, option, finish, fail, attemptsLeft,
                openMenu);
          }, 250);
          return;
        }
        try {
          button.focus();
        } catch (ex) {
          // Ignore; focus is only a hint.
        }
        this.#robustClick(button);
        this.#openAdjustViewMenu(button, option, finish, fail, attemptsLeft,
            openMenu);
      }, 150);
    };
    openMenu(3);
  }

  /**
   * After the three-dot button has been clicked: wait for the menu to
   * render, open the "Adjust view" submenu, pick the option, then wait for
   * the panel to close before re-arming. Retries the whole open sequence
   * if the menu never appears.
   */
  #openAdjustViewMenu(button, option, finish, fail, attemptsLeft, openMenu) {
    // Wait for the menu to render, then open the "Adjust view" submenu.
    this.#waitOpenMenuItem(['Adjust view'], 15, 100, (el) => {
      this.#robustClick(el);

      // Wait for the adjust-view panel to render, then pick the option.
      this.#waitOpenMenuItem([option], 30, 100, (choice) => {
        this.#robustClick(choice);
        // Only re-arm the button once the panel is confirmed closed;
        // interrupting the close is what used to wedge the menu.
        this.#waitForPanelClosed(button, finish);
      }, () => fail(`Unable to find "Adjust view" option: '${option}'`));
    }, () => {
      if (attemptsLeft > 1) {
        console.warn('*SD-Meet*', 'Menu did not open, retrying');
        this.#dismissOpenMenus();
        setTimeout(() => openMenu(attemptsLeft - 1), 200);
      } else {
        fail('Unable to find "Adjust view" menu item');
      }
    });
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
