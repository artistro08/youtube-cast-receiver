# Volume Fix — Manual Test Plan

## Test 1: Phone incremental volume (the primary bug)
1. Cast a YouTube video from phone to Steam Deck
2. On phone, tap the volume up/down buttons repeatedly (5-10 taps)
3. **Expected:** Volume changes smoothly without jumping back to previous values

## Test 2: Phone tap-to-set volume
1. Cast a YouTube video
2. On phone, tap a specific position on the volume slider
3. **Expected:** Volume goes to the tapped position and stays there

## Test 3: Rapid phone volume changes
1. Cast a YouTube video
2. On phone, drag the volume slider quickly from max to min
3. **Expected:** Volume follows the drag smoothly, no audible glitches

## Test 4: Deck slider still works
1. Cast a YouTube video
2. Use D-pad/slider on Deck to adjust volume
3. **Expected:** Volume changes smoothly, no jumping

## Test 5: Phone volume after Deck change
1. Adjust volume on Deck slider to ~50
2. Wait 2 seconds
3. Adjust volume from phone
4. **Expected:** Volume updates correctly on both devices

## Test 6: Reconnection volume restore
1. Cast a video, set volume to 50, disconnect phone
2. Reconnect phone (cast again)
3. **Expected:** After 2-second delay, volume restores to 50

## Test 7: Volume persists across sessions
1. Set volume to 30, close plugin/disconnect
2. Reconnect and cast again
3. **Expected:** Volume restores to 30

## Debugging
If jumping persists, check backend logs for the `[YTCast] doSetVolume` and
`[YTCast] doGetVolume` messages. Look for:
- Stale values returned by doGetVolume
- Out-of-order processing of volume commands
- Unexpected doSetVolume calls (e.g., from senderConnect restore)
