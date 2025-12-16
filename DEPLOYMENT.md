# Deployment Guide for brainscraper.io

This guide covers deploying brainscraper.io to various platforms.

## Prerequisites

- Node.js 18+ installed
- Git repository set up
- Domain name configured (brainscraper.io)

## Deployment Options

### Option 1: Vercel (Recommended)

Vercel is the recommended platform for Next.js applications.

#### Steps:

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with GitHub
   - Click "New Project"
   - Import your repository
   - Vercel will auto-detect Next.js settings
   - Click "Deploy"

3. **Configure Domain**
   - Go to Project Settings → Domains
   - Add `brainscraper.io`
   - Update DNS records as instructed by Vercel
   - SSL/HTTPS is automatically configured

#### Environment Variables

No environment variables required for basic functionality.

### Option 2: Netlify

1. **Push code to GitHub** (same as above)

2. **Deploy to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Sign in with GitHub
   - Click "New site from Git"
   - Select your repository
   - Build settings:
     - Build command: `npm run build`
     - Publish directory: `.next`
   - Click "Deploy site"

3. **Configure Domain**
   - Go to Site settings → Domain management
   - Add custom domain `brainscraper.io`
   - Update DNS records
   - SSL is automatically configured

### Option 3: Railway

1. **Push code to GitHub**

2. **Deploy to Railway**
   - Go to [railway.app](https://railway.app)
   - Sign in with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will auto-detect and deploy

3. **Configure Domain**
   - Go to Settings → Networking
   - Add custom domain `brainscraper.io`
   - Update DNS records

## Post-Deployment Checklist

- [ ] Verify site loads at production URL
- [ ] Test file upload functionality
- [ ] Test CSV file parsing
- [ ] Test Excel file parsing
- [ ] Verify responsive design on mobile
- [ ] Check browser console for errors
- [ ] Verify SSL/HTTPS is working
- [ ] Test accessibility features
- [ ] Monitor performance (Lighthouse score)

## Performance Optimization

The production build includes:
- Code minification
- Tree shaking
- Static page generation
- Optimized bundle sizes
- Package import optimization

## Troubleshooting

### Build Fails

- Check Node.js version (requires 18+)
- Run `npm install` to ensure dependencies are installed
- Check for TypeScript errors: `npm run build`

### File Upload Not Working

- Verify client-side JavaScript is loading
- Check browser console for errors
- Ensure file size is under 10MB limit

### Domain Not Resolving

- Verify DNS records are correctly configured
- Wait for DNS propagation (can take up to 48 hours)
- Check domain settings in deployment platform

## Support

For issues or questions, check the project README or open an issue on GitHub.

