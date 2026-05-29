# 📸 Memories – Trip Photo Sharing App

A real-time photo & video sharing app for group trips.
All 14 members upload from their phones, everyone sees everything, original quality preserved.

---

## 🚀 Deploy in 10 Minutes (Free on Render.com)

### Step 1 — Put code on GitHub

1. Go to https://github.com/new
2. Create a new repository called `memories-app` (keep it **Public**)
3. Click **"uploading an existing file"**
4. Upload ALL files from this folder:
   - `server.js`
   - `package.json`
   - `render.yaml`
   - `.gitignore`
   - `public/index.html`
5. Click **Commit changes**

---

### Step 2 — Deploy on Render (Free)

1. Go to https://render.com and sign up (free, use your Google account)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account → select `memories-app` repo
4. Render auto-detects settings from `render.yaml`. Just click **"Create Web Service"**
5. Wait ~2 minutes for build to finish
6. You get a live URL like: `https://memories-trip-app.onrender.com`

---

### Step 3 — Share with your group

1. Open your live URL on your phone
2. Enter your name + trip name → **Create Trip Album**
3. A **6-character code** is generated (e.g. `XK94BZ`)
4. Send this code + the URL to your 14 friends via WhatsApp:

```
📸 Join our trip album!
Open: https://memories-trip-app.onrender.com
Enter code: XK94BZ
Add your name and start uploading!
```

---

## 📱 How to Use

| Action | How |
|--------|-----|
| Create trip | Enter name + trip name on home screen |
| Join trip | Enter the 6-char code + your name |
| Upload photos | Tap Upload tab → select from gallery |
| View all photos | Gallery tab (filter by member) |
| See highlights | Memories tab |
| Download a photo | Open in lightbox → Download button |

---

## ✨ Features

- ✅ Original quality uploads (up to 100MB per file)
- ✅ Photos & videos both supported
- ✅ Auto-refreshes every 5 seconds (no need to reload)
- ✅ Filter gallery by each member
- ✅ Swipe through lightbox on mobile
- ✅ Download individual photos
- ✅ Works on iPhone & Android browsers
- ✅ Members reel on home screen
- ✅ Memories tab showing everyone's contributions

---

## 🔧 Run Locally (for testing)

```bash
npm install
node server.js
# Open http://localhost:3000
```

---

## 📁 File Structure

```
memories-app/
├── server.js          ← Express backend + API
├── package.json
├── render.yaml        ← Render deployment config
├── public/
│   └── index.html     ← Full frontend app
├── uploads/           ← Auto-created, stores media files
└── db.json            ← Auto-created, stores trip data
```

---

## 💡 Tips

- The **free Render tier** spins down after 15 min of inactivity — first load takes ~30 sec.
  To avoid this, upgrade to Render Starter ($7/mo) or use Railway.app instead.
- Photos are stored on Render's persistent disk (5GB free).
- For 14 members shooting all day, expect ~2–5GB of photos/videos.

---

Built with ❤️ for Saii's trip • Powered by Node.js + Express
