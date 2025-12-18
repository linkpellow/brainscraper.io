# brainscraper.io

A hacker-themed website for uploading and viewing spreadsheets (CSV, Excel files).

## Features

- Upload CSV and Excel files (.csv, .xls, .xlsx)
- Hacker-themed terminal aesthetic
- Client-side file parsing
- Data visualization
- **Lead Enrichment**: Auto-enrich leads with skip-tracing, income data, company info, LinkedIn profiles, Facebook data, and more
- **DNC Scrubbing**: Bulk scrub leads for Do-Not-Call status using USHA API
  - ✅ Automatic token acquisition and refresh
  - ✅ Seamless lead processing without interruptions
  - 📖 [Full Documentation](./docs/DNC_SCRUBBING_IMPLEMENTATION.md) | [Quick Reference](./docs/DNC_QUICK_REFERENCE.md)
  - ✅ Automatic token acquisition and refresh
  - ✅ Seamless lead processing without interruptions
  - 📖 [Full Documentation](./docs/DNC_SCRUBBING_IMPLEMENTATION.md) | [Quick Reference](./docs/DNC_QUICK_REFERENCE.md)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Build

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm start
```

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- papaparse (CSV parsing)
- xlsx (Excel parsing)

## Deployment

### Vercel (Recommended)

The easiest way to deploy is using [Vercel](https://vercel.com):

1. Push your code to GitHub
2. Import your repository in Vercel
3. Vercel will automatically detect Next.js and configure the build
4. Your site will be live!

### Other Platforms

This Next.js app can be deployed to any platform that supports Node.js:

- **Netlify**: Connect your Git repository and configure build command: `npm run build`
- **Railway**: Deploy with one click from GitHub
- **Heroku**: Use the Node.js buildpack

### Environment Variables

For basic functionality, no environment variables are required. All file processing happens client-side.

**For RapidAPI integrations:**
- Create a `.env.local` file
- Add: `RAPIDAPI_KEY=your-api-key-here`
- The API key will be used in server-side API routes

**For Telnyx Phone Lookup:**
- Add to `.env.local`: `TELNYX_API_KEY=your-telnyx-api-key-here`
- Get your API key from [Telnyx Mission Control Portal](https://portal.telnyx.com/)
- Provides carrier information, caller name (CNAM), and line type detection

**For USHA DNC Scrubbing:**
- Add to `.env.local`: `USHA_JWT_TOKEN=your-jwt-token-here`
- System automatically refreshes tokens on expiration (401/403 errors)
- 📖 **Documentation**: [Full Implementation Guide](./docs/DNC_SCRUBBING_IMPLEMENTATION.md) | [Quick Reference](./docs/DNC_QUICK_REFERENCE.md)
- Alternatively, you can enter the token manually in the UI when scrubbing
- Get your JWT token from USHA's authentication system

### Build Command

```bash
npm run build
```

### Start Command

```bash
npm start
```

## License

ISC

