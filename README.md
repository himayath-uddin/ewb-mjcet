# Engineers Without Borders — MJCET (EWB-MJCET)

Official website and real-time administrative content studio for the **Engineers Without Borders MJCET Student Chapter** at Muffakham Jah College of Engineering & Technology, Hyderabad.

---

## 🌟 Key Features

- **Chapter Identity & Mission:** Showcasing practical student engineering initiatives, community partnerships, and sustainable field development.
- **Dynamic Content Studio (`/admin`):** Full-featured content management dashboard to update hero headlines, statistics, project showcases, event logs, reports, and leadership rosters.
- **Firebase Cloud Real-Time Sync:** Powered by Cloud Firestore `onSnapshot` listeners. Edits published from the admin panel update instantly for all connected website visitors across any device without a page refresh.
- **Firebase Authentication:** Secure admin session management with email/password authentication and role-based claims.
- **Animated Emerald Impact Counter Bar:** Fluid floating counters with numerical intersection animations and custom cursor interaction.
- **Custom EWB Gear Cursor:** Smooth inertia-tracked desktop cursor with interactive hover, rotation motion on click, and responsive reduced-motion accessibility.
- **Vercel & Netlify Ready:** Configured with clean routing rewrites, Content Security Policy (CSP), clickjacking protection (`SAMEORIGIN`), and optimized caching headers.

---

## 📁 Repository Structure

```
├── index.html              # Main public website
├── styles.css              # Core design tokens, layout & responsive styling
├── script.js               # Website animations, counter observer & dynamic hydrate
├── content-defaults.js     # Default fallback site copy and data structures
├── content-store.js        # Multi-layer sync engine (Firestore + BroadcastChannel + LocalStorage)
├── firebase-config.js      # Firebase App, Auth & Firestore initialization
├── firebase.json           # Firebase service deployment configuration
├── firestore.rules         # Security rules (public read, authenticated admin write)
├── vercel.json             # Vercel production rewrites, headers & caching rules
├── package.json            # Deployment manifest
├── robots.txt              # Search engine crawler policies
├── admin/
│   ├── index.html          # Admin Portal & Login interface
│   ├── admin.css           # Content Studio visual design system
│   └── admin.js            # Admin editor logic, real-time live preview & auth
└── public/
    └── assets/             # Brand logos, photography & project media
```

---

## 🚀 Quick Start (Local Development)

Run a local HTTP server:
```bash
python -m http.server 8765
```

- **Main Website:** `http://localhost:8765/index.html`
- **Admin Portal:** `http://localhost:8765/admin/index.html`

---

## 🔐 Admin Access

- **Username / Email:** `admin` *(or `admin@ewbmjcet.org`)*
- **Password:** `ewb@mjcet2026`

---

## ☁️ Deployment

Configured for one-click deployment on **Vercel**:
1. Connect this repository on [vercel.com](https://vercel.com).
2. Set Project Name to **`ewb-mjcet`**.
3. Deploy!
4. Add your deployed Vercel domain to **Firebase Console ➔ Authentication ➔ Settings ➔ Authorized Domains**.
