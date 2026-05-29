const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads dir exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// In-memory DB (persisted to db.json)
const DB_FILE = './db.json';
let db = { trips: {} };
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) {}
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video)\//.test(file.mimetype);
    cb(null, ok);
  }
});

// --- ROUTES ---

// Create trip
app.post('/api/trip/create', (req, res) => {
  const { tripName, creatorName } = req.body;
  if (!tripName || !creatorName) return res.status(400).json({ error: 'Missing fields' });
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const tripId = uuidv4();
  db.trips[code] = {
    id: tripId,
    code,
    name: tripName,
    createdAt: new Date().toISOString(),
    members: [{ name: creatorName, isAdmin: true, joinedAt: new Date().toISOString() }],
    photos: []
  };
  saveDB();
  res.json({ code, tripName, creatorName });
});

// Join trip
app.post('/api/trip/join', (req, res) => {
  const { code, memberName } = req.body;
  const trip = db.trips[code?.toUpperCase()];
  if (!trip) return res.status(404).json({ error: 'Trip not found. Check the code.' });
  const exists = trip.members.find(m => m.name.toLowerCase() === memberName?.toLowerCase());
  if (exists) return res.json({ code: trip.code, tripName: trip.name, memberName, alreadyMember: true });
  trip.members.push({ name: memberName, isAdmin: false, joinedAt: new Date().toISOString() });
  saveDB();
  res.json({ code: trip.code, tripName: trip.name, memberName });
});

// Get trip data
app.get('/api/trip/:code', (req, res) => {
  const trip = db.trips[req.params.code?.toUpperCase()];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

// Upload photos/videos
app.post('/api/trip/:code/upload', upload.array('files', 20), (req, res) => {
  const trip = db.trips[req.params.code?.toUpperCase()];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const { uploaderName, caption } = req.body;
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
  const added = req.files.map(f => ({
    id: uuidv4(),
    filename: f.filename,
    originalName: f.originalname,
    url: `/uploads/${f.filename}`,
    type: f.mimetype.startsWith('video/') ? 'video' : 'image',
    uploader: uploaderName,
    caption: caption || '',
    uploadedAt: new Date().toISOString(),
    size: f.size
  }));
  trip.photos.push(...added);
  saveDB();
  res.json({ uploaded: added.length, photos: added });
});

// Delete photo (admin only)
app.delete('/api/trip/:code/photo/:photoId', (req, res) => {
  const trip = db.trips[req.params.code?.toUpperCase()];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const idx = trip.photos.findIndex(p => p.id === req.params.photoId);
  if (idx === -1) return res.status(404).json({ error: 'Photo not found' });
  const photo = trip.photos[idx];
  try { fs.unlinkSync(`./uploads/${photo.filename}`); } catch(e) {}
  trip.photos.splice(idx, 1);
  saveDB();
  res.json({ deleted: true });
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve frontend for all other routes
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Memories app running on http://localhost:${PORT}`));
