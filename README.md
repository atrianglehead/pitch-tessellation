# Visual Instrument — Intonation Switcher

This web app is an interactive audiovisual instrument built with [p5.js](https://p5js.org/).
It lets you play MIDI notes through the browser and explore different intonation systems
and waveforms while visualizing the sound.

## Features

- **Intonation presets:** Equal temperament, Just Intonation (5‑limit), Pythagorean,
  and nearest harmonic tuning.
- **Waveforms:** Sine, triangle (default), sawtooth, and square.
- **ADSR envelope:** Adjustable attack, decay, sustain, and release times.
- **MIDI support:** Connect a MIDI controller for input.
- **Visual feedback:** Animated line tiles respond to the audio envelope.

## Getting Started

1. Open `index.html` in a modern web browser.
2. Click **Tap to Begin** to enable audio.
3. Play notes using your computer keyboard or a connected MIDI device.

   Keyboard mapping covers C2–C5:

   - `1`–`=` → C2–B2
   - `Q`–`]` → C3–B3
   - `A`–`\` → C4–B4
   - `Z` → C5

The controls panel lets you change intonation, waveform, volume, and ADSR
parameters. Current tuning metadata appears below the sliders when relevant.

## Accessibility

- All interactive controls are keyboard‑accessible and labeled.
- Colors provide high contrast against the black background.
- The app requires a user gesture (button press) to activate audio, which works
  with keyboard or mouse.

## License

This project is released under the terms of the MIT License. See [LICENSE](LICENSE).
