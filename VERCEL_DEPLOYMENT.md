# Vercel Deployment & Security Guide for EWB-MJCET

This project is fully configured for deployment on **Vercel** with production security headers, clean URL rewrites, and Cloud Firestore + Firebase Authentication.

---

## 1. Quick Deployment Options

### Option A: Deploy via GitHub (Recommended)
1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **"Add New..."** -> **"Project"**.
3. Import your GitHub repository.
4. In the project configuration:
   - **Framework Preset:** `Other`
   - **Root Directory:** If deploying the full workspace, set Root Directory to `g-p-6abf9e417b5c8191b902f38c4c4a7a53` (or leave as `./` if uploading only that folder).
5. Click **"Deploy"**.

### Option B: Deploy via Vercel CLI
If you have Node.js and Vercel CLI installed:
```bash
# In the project directory (c:\Users\DELL\Desktop\EWB_MJCET\g-p-6abf9e417b5c8191b902f38c4c4a7a53)
vercel
```
Follow the interactive prompts to deploy in seconds.

---

## 2. Crucial Post-Deployment Step: Authorize Vercel Domain in Firebase

Firebase Authentication requires the domain to be authorized in your Firebase Console.

1. Once deployed, copy your Vercel URL (e.g. `https://ewb-mjcet.vercel.app`).
2. Go to the [Firebase Console](https://console.firebase.google.com/).
3. Select your project: **`ewb-mjcet-portal`**.
4. In the left navigation, click **Authentication** -> **Settings** tab.
5. Under **Authorized domains**, click **"Add domain"**.
6. Paste your Vercel domain (e.g. `ewb-mjcet.vercel.app` without `https://`) and click **Save**.

*(Note: `localhost` is already pre-authorized for local development).*

---

## 3. Included Production & Security Features

- **Clean URLs & Admin Routing:** `/admin` cleanly routes to `/admin/index.html` without showing file extensions.
- **Security Headers (`vercel.json`):**
  - `X-Frame-Options: SAMEORIGIN` (prevents clickjacking attacks)
  - `X-Content-Type-Options: nosniff` (stops MIME sniffing)
  - `X-XSS-Protection: 1; mode=block` (cross-site scripting protection)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy`: Specifically whitelist Firebase SDK, Google Fonts, and Cloud Firestore endpoints.
- **Search Engine Crawling (`robots.txt`):** The public site is open to crawlers, while `/admin` is shielded from indexing.
- **Optimized Caching:** Static assets are cached for 1 year (`immutable`), while HTML pages use `max-age=0, must-revalidate` so that admin edits reflect immediately.
- **Admin Credentials:** `admin` or `admin@ewbmjcet.org` / `ewb@mjcet2026`.
