# Meet + StreamDeck Helper

Last Updated: 2021-09-30

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

* Thanks to @jimmc, who implemented support for the  StreamDeck Mini.
* Thanks to @alextcowan, who implemented support for the StreamDeck v1.

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

### Linux

On linux, the udev subsystem blocks access to the StreamDeck without some
special configuration. Save the following to `/etc/udev/rules.d/50-elgato.rules`
and reload the rules with `sudo udevadm control --reload-rules`.

```
SUBSYSTEM=="input", GROUP="input", MODE="0666"
# Stream Deck Original
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0060", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0060", MODE:="666", GROUP="plugdev"
# Stream Deck Mini
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0063", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0063", MODE:="666", GROUP="plugdev"
# Stream Deck XL
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006c", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006c", MODE:="666", GROUP="plugdev"
# Stream Deck Original (v2)
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006d", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006d", MODE:="666", GROUP="plugdev"
# Stream Deck MK.2
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0080", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0080", MODE:="666", GROUP="plugdev"
# Stream Deck +
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0084", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0084", MODE:="666", GROUP="plugdev"
# Stream Deck Pedal
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0086", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0086", MODE:="666", GROUP="plugdev"
# Stream Deck XL (v2)
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="008f", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="008f", MODE:="666", GROUP="plugdev"
# Stream Deck Mini (v2)
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0090", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0090", MODE:="666", GROUP="plugdev"
```

Thanks to [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck#linux)
for figuring that out and documenting it. Thanks to [The USB ID
Repository](https://usb-ids.gowdy.us/read/UD/0fd9) for the additional device
names.
