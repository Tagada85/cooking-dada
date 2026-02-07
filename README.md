# Cooking Dada 👨‍🍳

**Ton assistant cuisine personnel** - *Extase et gourmandise*

A personal cooking assistant PWA that helps you:
- 📦 Track your ingredient inventory
- 📖 Manage your recipes
- ✅ See which recipes you can cook with what you have
- 🍳 Deduct ingredients when you cook

Works **100% offline** - perfect for use in the kitchen or while grocery shopping!

## Features

- **Inventory Management**: Add ingredients to your stock with quantities and units
- **Recipe Management**: Create, edit, and delete recipes
- **Smart Matching**: See at a glance which recipes you can make (green) or can't (red)
- **Unit Conversion**: Automatically converts between grams/kilos, ml/liters, etc.
- **Cook Mode**: Deduct ingredients from stock when you prepare a recipe
- **Offline First**: Works without internet after first load
- **Installable**: Add to your home screen like a native app

## Installation

### Option 1: Use Online (Recommended)

Visit the hosted version and install it as a PWA:

1. Open the app in your browser
2. Click "Install" or "Add to Home Screen" when prompted
3. Done! Use it offline anytime

### Option 2: Self-Host

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/cooking-dada.git
cd cooking-dada

# Install dependencies
npm install

# Build
npm run build

# Serve locally
npx serve .
```

Then open http://localhost:3000/public/

## Development

```bash
# Watch mode for development
npm run watch

# In another terminal, serve the files
npx serve .
```

## Tech Stack

- **TypeScript** - Type-safe JavaScript
- **Vanilla JS** - No framework, fast and simple
- **LocalStorage** - Data persisted locally
- **Service Worker** - Offline capability
- **PWA** - Installable on any device

## Project Structure

```
cooking-dada/
├── public/
│   ├── index.html      # Main HTML
│   ├── style.css       # Styles (cookbook theme)
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service worker
│   └── icons/          # App icons
├── src/
│   ├── main.ts         # Entry point
│   ├── types.ts        # Type definitions
│   ├── units.ts        # Unit conversion
│   ├── stocks.ts       # Stock management
│   ├── recipes.ts      # Recipe management
│   └── ui.ts           # UI components
└── dist/               # Compiled JS
```

## Creating Icons

For the PWA to be installable, you need icons. Create two PNG files:
- `public/icons/icon-192.png` (192x192 pixels)
- `public/icons/icon-512.png` (512x512 pixels)

You can use tools like:
- [Favicon.io](https://favicon.io/)
- [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator)

## Hosting Options

Free hosting options for PWAs:

| Platform | How to Deploy |
|----------|---------------|
| **GitHub Pages** | Push to GitHub, enable Pages in settings |
| **Netlify** | Connect repo, auto-deploys on push |
| **Vercel** | Connect repo, auto-deploys on push |
| **Cloudflare Pages** | Connect repo, auto-deploys on push |

### GitHub Pages Quick Setup

1. Push your code to GitHub
2. Go to Settings → Pages
3. Select "Deploy from branch" → `main` → `/public`
4. Your app will be live at `https://username.github.io/cooking-dada/`

## License

MIT License - See [LICENSE](LICENSE) file

## Credits

Inspired by a handmade cookbook with love 🧡
