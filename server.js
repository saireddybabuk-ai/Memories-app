const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB connection ─────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable not set!');
  process.exit(1);
}
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(e => { console.error('MongoDB error:', e); process.exit(1); });

// ── Trip Schema ────────────────────────────────────────
const photoSchema = new mongoose.Schema({
  id: String,
  filename: String,
  originalName: String,
  url: String,
  publicId: String,
  type: String,
  uploader: String,
  caption: String,
  uploadedAt: String,
  size: Number
});

const tripSchema = new mongoose.Schema({
  id: String,
  code: { type: String, unique: true },
  name: String,
  createdAt: String,
  members: Array,
  banned: { type: Array, default: [] },
  photos: [photoSchema]
});

const Trip = mongoose.model('Trip', tripSchema);

// ── Cloudinary config ──────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `memories-app/${req.params.code}`,
    resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
    public_id: uuidv4(),
    // preserve original quality
    transformation: file.mimetype.startsWith('video/')
      ? [] : [{ quality: 'auto:best', fetch_format: 'auto' }]
  })
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^(image|video)\//.test(file.mimetype));
  }
});

// ── ROUTES ─────────────────────────────────────────────

// Create trip
app.post('/api/trip/create', async (req, res) => {
  try {
    const { tripName, creatorName, password } = req.body;
    if (!tripName || !creatorName) return res.status(400).json({ error: 'Missing fields' });
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'memories2026';
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password. Only the organiser can create a trip.' });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const trip = await Trip.create({
      id: uuidv4(), code, name: tripName,
      createdAt: new Date().toISOString(),
      members: [{ name: creatorName, isAdmin: true, joinedAt: new Date().toISOString() }],
      banned: [], photos: []
    });
    res.json({ code: trip.code, tripName: trip.name, creatorName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not create trip' });
  }
});

// Join trip
app.post('/api/trip/join', async (req, res) => {
  try {
    const { code, memberName, password } = req.body;
    const trip = await Trip.findOne({ code: code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found. Check the code.' });

    const adminMember = trip.members.find(m => m.isAdmin);
    if (adminMember && adminMember.name.toLowerCase() === memberName?.toLowerCase()) {
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'memories2026';
      if (password !== ADMIN_PASSWORD)
        return res.status(401).json({ error: 'This name belongs to the trip organiser. Enter the admin password to continue.', requiresPassword: true });
      return res.json({ code: trip.code, tripName: trip.name, memberName, isAdmin: true });
    }

    const banned = (trip.banned || []).map(b => b.toLowerCase());
    if (banned.includes(memberName?.toLowerCase()))
      return res.status(403).json({ error: 'You have been removed from this trip by the organiser and cannot rejoin.' });

    const exists = trip.members.find(m => m.name.toLowerCase() === memberName?.toLowerCase());
    if (exists) return res.json({ code: trip.code, tripName: trip.name, memberName, alreadyMember: true });

    trip.members.push({ name: memberName, isAdmin: false, joinedAt: new Date().toISOString() });
    await trip.save();
    res.json({ code: trip.code, tripName: trip.name, memberName });
  } catch (e) {
    res.status(500).json({ error: 'Could not join trip' });
  }
});

// Get trip data
app.get('/api/trip/:code', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload photos/videos
app.post('/api/trip/:code/upload', upload.array('files', 20), async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { uploaderName, caption } = req.body;
    const banned = (trip.banned || []).map(b => b.toLowerCase());
    if (banned.includes(uploaderName?.toLowerCase()))
      return res.status(403).json({ error: 'You have been removed from this trip and cannot upload.' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });

    const added = req.files.map(f => ({
      id: uuidv4(),
      filename: f.filename,
      originalName: f.originalname,
      url: f.path,
      publicId: f.filename,
      type: f.mimetype?.startsWith('video/') ? 'video' : 'image',
      uploader: uploaderName,
      caption: caption || '',
      uploadedAt: new Date().toISOString(),
      size: f.size
    }));
    trip.photos.push(...added);
    await trip.save();
    res.json({ uploaded: added.length, photos: added });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

// Remove member
app.delete('/api/trip/:code/member', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { memberName } = req.body;
    const idx = trip.members.findIndex(m => m.name.toLowerCase() === memberName?.toLowerCase());
    if (idx === -1) return res.status(404).json({ error: 'Member not found' });
    if (trip.members[idx].isAdmin) return res.status(403).json({ error: 'Cannot remove the admin' });
    trip.members.splice(idx, 1);
    if (!trip.banned) trip.banned = [];
    if (!trip.banned.map(b => b.toLowerCase()).includes(memberName.toLowerCase()))
      trip.banned.push(memberName.toLowerCase());
    await trip.save();
    res.json({ removed: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Unban member
app.post('/api/trip/:code/unban', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { memberName } = req.body;
    trip.banned = (trip.banned || []).filter(b => b.toLowerCase() !== memberName?.toLowerCase());
    await trip.save();
    res.json({ unbanned: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete photo
app.delete('/api/trip/:code/photo/:photoId', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const idx = trip.photos.findIndex(p => p.id === req.params.photoId);
    if (idx === -1) return res.status(404).json({ error: 'Photo not found' });
    const photo = trip.photos[idx];
    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(photo.publicId,
        { resource_type: photo.type === 'video' ? 'video' : 'image' });
    } catch (e) { console.warn('Cloudinary delete warn:', e.message); }
    trip.photos.splice(idx, 1);
    await trip.save();
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState }));

// Frontend
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Memories app running on http://localhost:${PORT}`));
