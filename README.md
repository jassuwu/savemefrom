<h1 align="center">save me from</h1>

<p align="center">

<img src="https://img.shields.io/badge/React-000000.svg?style=for-the-badge&logo=react&logoColor=white">
<img src="https://img.shields.io/badge/TypeScript-000000.svg?style=for-the-badge&logo=typescript&logoColor=white">
<img src="https://img.shields.io/badge/Vite-000000.svg?style=for-the-badge&logo=vite&logoColor=white">
<img src="https://img.shields.io/badge/Bun-000000.svg?style=for-the-badge&logo=bun&logoColor=white">

</p>

<p align="center">
paste any URL. vergil's <i>judgement cut</i> slashes it.
</p>

## how it works

paste a URL or drop an image. 3.5 seconds later the screen goes green, the cuts land, the flash fires, and vergil's scene takes over.

the trick is an SVG `feColorMatrix` chroma-key filter on the vergil clip — the green phase goes transparent, so the video's baked-in slashes appear as cuts over whatever you fed in. no three.js, no shatter math, no wasted pixels.

## the share loop

the URL itself carries the payload.

```
savefrom.jass.gg/?u=https://some.cringe.site
savefrom.jass.gg/?i=https://some.image.png
```

when someone opens your link, vergil arrives with zero interaction. after the slash fires, `history.replaceState` primes the address bar so the browser URL is already shareable. copy → paste to DMs → repeat.

## input

- **paste** anywhere (⌘V / ctrl+V) — URL text, image file, or data URL
- **drop** an image file anywhere on the page
- **?u=** / **?i=** URL params on page load

there is no input field. there doesn't need to be.

## project structure

```
savemefrom/
├── src/
│   ├── components/
│   │   ├── CanvasStage.tsx    # <img> + chroma-keyed <video>
│   │   └── EndControls.tsx    # corner share/replay/reset
│   ├── lib/
│   │   ├── imageInput.ts      # file / data URL / clipboard helpers
│   │   └── screenshot.ts      # microlink screenshot fetch
│   ├── state/
│   │   └── machine.ts         # idle → loading → ready → slashing → revealed
│   ├── App.tsx                # paste/drop listeners, URL-param boot
│   └── App.css
├── public/
│   └── vergil.mp4             # the clip (greenscreen + slashes baked in)
└── index.html                 # SVG chroma-key filter lives here
```

## develop

```bash
bun install
bun run dev
```

built for speed, simplicity, and vergilposting.
