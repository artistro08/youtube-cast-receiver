# YouTube Cast Receiver for Steam Deck

A [Decky Loader](https://decky.xyz/) plugin that turns your Steam Deck into a YouTube Cast receiver. Cast music and videos from the YouTube or YouTube Music app on your phone and control playback from the Decky panel.

## Features

- Cast audio from YouTube / YouTube Music on your phone to your Steam Deck
- Player tab with album art, track info, progress bar, and playback controls (play/pause/next/prev)
- Queue tab showing upcoming tracks with metadata
- Volume control from the Deck panel
- Persistent pairing — pair once, auto-reconnects on plugin load
- Audio-only playback (works like a Chromecast Audio)

## How to Use

1. Install the plugin via Decky Loader (developer mode, install from ZIP)
2. Open the Decky panel — the plugin starts automatically and advertises on your network
3. On your phone, open YouTube or YouTube Music
4. Tap the **Cast** icon and select your Steam Deck (shown by its hostname)
5. Play a song — audio plays through the Steam Deck

### Pairing

The plugin uses DIAL/SSDP for network discovery. Your phone and Steam Deck must be on the same WiFi network. Once paired, the connection persists — the phone will auto-reconnect when the plugin loads.

If your Steam Deck doesn't appear in the cast list, your router may block multicast between WiFi clients (common with mesh networks). Try the "Link with TV code" option in YouTube settings as an alternative.

## Known Limitations

- **Queue is read-only** — The queue is managed by the YouTube app on your phone. You can view it in the Queue tab, but adding/removing tracks must be done from the phone. Tapping a queue item will attempt to jump to it.
- **Audio only** — Video content plays audio only. The plugin does not render video.
- **yt-dlp dependency** — Audio extraction relies on yt-dlp. If YouTube changes its anti-bot measures, playback may break until yt-dlp is updated. The plugin attempts to self-update yt-dlp on each load.

## Updating

To update the plugin, you must **uninstall the existing version first**, then install the new ZIP. Installing over an existing installation does not work because the running Node.js backend process holds the port and cannot be replaced in-place.

1. Open Decky settings
2. Uninstall "YouTube Cast Receiver"
3. Install the new ZIP via developer options

## Building from Source

Requires: Node.js, pnpm, PowerShell (Windows)

```powershell
# Install dependencies
pnpm install

# Build frontend + backend
pnpm run build
pnpm run build:backend

# Run tests
pnpm test

# Package into ZIP (downloads Node.js + yt-dlp linux binaries)
pnpm run package
```

The output `youtube-cast-receiver.zip` can be installed on the Steam Deck via Decky's developer install option.

## Architecture

- **Frontend**: React/TypeScript using Decky SDK (`@decky/ui`, `@decky/api`)
- **Backend**: Node.js with [yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver) for the cast protocol, [yt-dlp](https://github.com/yt-dlp/yt-dlp) for audio URL extraction
- **Communication**: HTTP REST for commands, WebSocket for real-time state sync
- **Process management**: Python `main.py` shim spawns the Node.js backend as a subprocess

## License

BSD-3-Clause
