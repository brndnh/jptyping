# JP Typing Practice

Japanese typing practice in the browser. Type the reading of each word in romaji or kana.

## Develop

    npm install
    npm run dev

## Deploy

Import the repo in Vercel. It detects Vite automatically (build: `npm run build`, output: `dist`).
`api/jisho.js` deploys as a serverless function that proxies jisho.org for the "jisho" word source.
