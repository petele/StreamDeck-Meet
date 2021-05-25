# Meet + StreamDeck Helper

Last Updated: 2021-05-25

## The problem

The keyboard shortcuts in Meet are great, but I want dedicated hardware buttons
to be able to easily mute/unmute myself, turn the camera on/off, raise my hand,
etc. Thanks to WebHID, the Elgato StreamDeck, and a Chrome Extension, I now
have them.

## The solution

### Elgato StreamDeck

The [Elgato StreamDeck](https://www.elgato.com/en/gaming/stream-deck) is a
programmable 15 key keyboard. Each key is backed with an LCD panel, making it
easy to customize the buttons for any use. It connects to the computer via
USB and HID.

Thanks to @jimmc, support for the StreamDeck Mini was added on 2021-05-25.

### WebHID

The Chrome team is currently implementing [WebHID](https://web.dev/hid/), which
will allow pages to interact with HID devices like the StreamDeck.

Because this uses Chrome's WebHID implementation, no device drivers are needed,
and it works beautifully on ChromeOS, Mac, Windows, and Linux (though I haven't
tested it there).

## The implementation

To use the StreamDeck with Meet, I created a Chrome extension, it uses a content
script to inject the code into the meet page. The code then detects the status
of the meeting (lobby, green room, in meeting, in exit hall), and adjusts the
StreamDeck buttons as appropriate.

I considered making the `StreamDeck.js` a custom element, but ran into issues
with custom elements not being fully supported within Chrome Extensions. I
could have used the polyfill, but for sake of speed, I just went with a generic
class. I hope to be able to fix that in the near future.

### In lobby

In the lobby, 2 buttons are enabled:

* Start next scheduled meeting.
* Start instant meeting.

### In green room

In the green room, there are three buttons enabled:

* Enter meeting (Join now).
* Mute/unmute mic.
* Enable/disable cam.
* Return to home screen.

### In the meeting

While in the meeting, there are sevent buttons enabled:

* Mute/unmute mic.
* Enable/disable cam.
* Enable/disable captions (when available).
* Raise/lower hand (when available).
* Stop presenting (when applicable).
* Show/hide meeting info.
* Show/hide people in meeting.
* Show/hide chat.
* Show/hide activities panel (when available).
* Leave meeting.

### After meeting

* Rejoin meeting.
* Return to home screen.

## Support for Hue Lights

The extension can turn a Hue light on and off at the beginning/end of each
meeting. I haven't written any UI/UX for this yet, so you'll need to configure
it using the console for now.

To setup a Hue light, update the following code with your info, and paste
it into the console.

```js
localStorage['msdHue'] = JSON.stringify({
  address: "IP address of your hub",
  apiKey: "API key to access the hub",
  lightId: "1",
  autoOn: true
});
```

## Trying it yourself

To try the extension yourself, you'll need a StreamDeck device, then follow
the instructions below.

1. Open `chrome://extensions/`, and enable developer mode.
1. Load the unpacked extension from the `src` folder.
1. Open [Google Meet](https://meet.google.com).
1. Ensure the StreamDeck device is plugged into your computer.
1. Click on the 'Connect StreamDeck' button in the upper left corner.
1. In the device picker, choose the StreamDeck and click Connect.

Note: Googlers, see go/streamdeck-meet-for-googlers for an additional step
you'll need to take.

If everything worked, the StreamDeck should now be connected and your buttons
should have updated to support starting instant meetings. Chrome will remember
the connection, so you don't need to run the connect step again in the future.

## Caveats

* This is a proof of concept, and experiment for me to better learn the WebHID
  API, there **are** bugs.
* After closing the page/navigating away, the buttons will likely remain
  unchanged, and clicking them won't do anything. Once you open Meet again,
  they'll start working.
