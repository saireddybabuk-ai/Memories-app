const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB ────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  })
  .catch(e => {
    console.error('❌ MongoDB connection failed:', e.message);
    process.exit(1);
  });

app.use('/api', (req, res, next) => {
  if (mongoose.connection.readyState !== 1)
    return res.status(503).json({ error: 'Database connecting, please retry in a few seconds.' });
  next();
});

// ── Schemas ────────────────────────────────────────────
const photoSchema = new mongoose.Schema({
  id: String, publicId: String, originalName: String,
  url: String, type: String, uploader: String,
  caption: String, uploadedAt: String, size: Number
});
const tripSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  name: String, createdAt: String,
  members: Array, banned: { type: Array, default: [] },
  photos: [photoSchema]
});
const Trip = mongoose.model('Trip', tripSchema);

// ── Cloudinary ─────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Use memory storage — upload buffer directly to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype))
});

function uploadToCloudinary(buffer, mimetype, folder) {
  const isVideo = mimetype.startsWith('video/');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: isVideo ? 'video' : 'image', public_id: uuidv4() },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

// ── ROUTES ─────────────────────────────────────────────

// Create trip
app.post('/api/trip/create', async (req, res) => {
  try {
    const { tripName, creatorName, password } = req.body;
    if (!tripName || !creatorName) return res.status(400).json({ error: 'Missing fields' });
    if (password !== (process.env.ADMIN_PASSWORD || 'memories2026'))
      return res.status(401).json({ error: 'Wrong password. Only the organiser can create a trip.' });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const trip = await Trip.create({
      code, name: tripName, createdAt: new Date().toISOString(),
      members: [{ name: creatorName, isAdmin: true, joinedAt: new Date().toISOString() }],
      banned: [], photos: []
    });
    res.json({ code: trip.code, tripName: trip.name, creatorName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Join trip
app.post('/api/trip/join', async (req, res) => {
  try {
    const { code, memberName, password } = req.body;
    const trip = await Trip.findOne({ code: code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found. Check the code.' });
    const admin = trip.members.find(m => m.isAdmin);
    if (admin && admin.name.toLowerCase() === memberName?.toLowerCase()) {
      if (password !== (process.env.ADMIN_PASSWORD || 'memories2026'))
        return res.status(401).json({ error: 'This name belongs to the trip organiser. Enter the admin password to continue.' });
      return res.json({ code: trip.code, tripName: trip.name, memberName, isAdmin: true });
    }
    if ((trip.banned||[]).map(b=>b.toLowerCase()).includes(memberName?.toLowerCase()))
      return res.status(403).json({ error: 'You have been removed from this trip by the organiser and cannot rejoin.' });
    if (!trip.members.find(m => m.name.toLowerCase() === memberName?.toLowerCase())) {
      trip.members.push({ name: memberName, isAdmin: false, joinedAt: new Date().toISOString() });
      await trip.save();
    }
    res.json({ code: trip.code, tripName: trip.name, memberName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get trip
app.get('/api/trip/:code', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload
app.post('/api/trip/:code/upload', upload.array('files', 20), async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { uploaderName, caption } = req.body;
    if ((trip.banned||[]).map(b=>b.toLowerCase()).includes(uploaderName?.toLowerCase()))
      return res.status(403).json({ error: 'You have been removed from this trip and cannot upload.' });
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });

    const added = [];
    for (const f of req.files) {
      const result = await uploadToCloudinary(f.buffer, f.mimetype, `memories-app/${req.params.code}`);
      added.push({
        id: uuidv4(), publicId: result.public_id,
        originalName: f.originalname, url: result.secure_url,
        type: f.mimetype.startsWith('video/') ? 'video' : 'image',
        uploader: uploaderName, caption: caption || '',
        uploadedAt: new Date().toISOString(), size: f.size
      });
    }
    trip.photos.push(...added);
    await trip.save();
    res.json({ uploaded: added.length, photos: added });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    if (!trip.banned.map(b=>b.toLowerCase()).includes(memberName.toLowerCase()))
      trip.banned.push(memberName.toLowerCase());
    await trip.save();
    res.json({ removed: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Unban
app.post('/api/trip/:code/unban', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    trip.banned = (trip.banned||[]).filter(b => b.toLowerCase() !== req.body.memberName?.toLowerCase());
    await trip.save();
    res.json({ unbanned: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete photo
app.delete('/api/trip/:code/photo/:photoId', async (req, res) => {
  try {
    const trip = await Trip.findOne({ code: req.params.code?.toUpperCase() });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const idx = trip.photos.findIndex(p => p.id === req.params.photoId);
    if (idx === -1) return res.status(404).json({ error: 'Photo not found' });
    const photo = trip.photos[idx];
    try { await cloudinary.uploader.destroy(photo.publicId, { resource_type: photo.type === 'video' ? 'video' : 'image' }); } catch(e) {}
    trip.photos.splice(idx, 1);
    await trip.save();
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState }));

app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
