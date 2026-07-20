# Color Picker

A Teenage Engineering–styled color picker built as a [Rabbit R1](https://www.rabbit.tech/) creation. Point the camera (or pick a photo), sample colors from the frame, read the Hex / RGB / HSL codes, fine-tune with H/S/V sliders, and get an approximate Pantone match.

**Live:** https://travisbrant1-cyber.github.io/r1-color-picker/

## Features

- Camera capture or file upload, processed entirely in-browser
- Tap-to-sample color picking with a swatch strip
- Hex, RGB, and HSL readouts
- H/S/V sliders to nudge the sampled swatch
- Approximate Pantone match (not official Pantone data)
- Sized for the R1's 240×282 screen (PTT/scroll wheel aware)

## Tech

Plain static HTML/CSS/JS — no build step, no backend, no tracking. All image data stays on-device (`URL.createObjectURL`, canvas sampling); nothing is uploaded.

The only external dependency is the [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) webfont, loaded from Google Fonts at runtime. It degrades gracefully to a monospace system stack if unavailable.

## Structure

```
index.html        # main creation
css/styles.css
js/app.js
v2/               # TE-styled test build
```

## License

[MIT](LICENSE)
