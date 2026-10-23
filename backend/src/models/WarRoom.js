import mongoose from 'mongoose';
import { isDbConnected } from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WAR_ROOMS_FILE = path.resolve(__dirname, '../data/war-rooms.json');

const warRoomSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    siteName: { type: String, default: null },
    siteId: { type: String, default: null },
    severity: { type: String, default: 'SEV 1' },
    lead: { type: String, default: null },
    notes: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    bufferCommands: false, // Prevents queries from hanging when MongoDB is disconnected or connecting!
    autoIndex: false,
  }
);

export const WarRoomModel =
  mongoose.models.WarRoom || mongoose.model('WarRoom', warRoomSchema);

let _memoryRooms = null;

function readFromFile() {
  try {
    if (fs.existsSync(WAR_ROOMS_FILE)) {
      const data = fs.readFileSync(WAR_ROOMS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('[WarRoomModel] Error reading file:', err.message);
  }
  return [];
}

function writeToFile(list) {
  try {
    const dir = path.dirname(WAR_ROOMS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WAR_ROOMS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[WarRoomModel] Error writing file:', err.message);
  }
}

function getMemoryRooms() {
  if (_memoryRooms === null) {
    _memoryRooms = readFromFile();
  }
  return _memoryRooms;
}

export const WarRoomRepository = {
  async findAll() {
    // If DB is connected, fetch and sync asynchronously
    if (isDbConnected()) {
      try {
        const rooms = await Promise.race([
          WarRoomModel.find({ is_active: true }).sort({ startedAt: -1 }).lean(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Mongo timeout')), 1000)),
        ]);
        if (Array.isArray(rooms)) {
          const formatted = rooms.map(r => ({
            id: r.id,
            name: r.name,
            url: r.url,
            siteName: r.siteName,
            siteId: r.siteId,
            severity: r.severity,
            lead: r.lead,
            notes: r.notes,
            startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : new Date().toISOString(),
          }));
          _memoryRooms = formatted;
          writeToFile(formatted);
          return formatted;
        }
      } catch {
        // Fallback to instant memory/file
      }
    }
    return getMemoryRooms();
  },

  async create(roomData) {
    const newRoom = {
      id: roomData.id || `wr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(roomData.name).trim(),
      url: String(roomData.url).trim(),
      siteName: roomData.siteName ? String(roomData.siteName).trim() : null,
      siteId: roomData.siteId ? String(roomData.siteId).trim() : null,
      severity: roomData.severity ? String(roomData.severity).trim() : 'SEV 1',
      lead: roomData.lead ? String(roomData.lead).trim() : null,
      notes: roomData.notes ? String(roomData.notes).trim() : null,
      startedAt: roomData.startedAt ? new Date(roomData.startedAt) : new Date(),
      is_active: true,
    };

    const formattedRoom = {
      ...newRoom,
      startedAt: newRoom.startedAt.toISOString(),
    };

    // Instant update in-memory and write to file (< 1ms latency)
    const current = getMemoryRooms().filter(r => r.id !== newRoom.id);
    _memoryRooms = [formattedRoom, ...current];
    writeToFile(_memoryRooms);

    // Asynchronously upsert to MongoDB without delaying the response
    if (isDbConnected()) {
      WarRoomModel.findOneAndUpdate(
        { id: newRoom.id },
        { $set: newRoom },
        { upsert: true }
      ).catch(err => console.error('[WarRoomRepository] Mongo async create warning:', err.message));
    }

    return formattedRoom;
  },

  async delete(id) {
    // Instant update in-memory and write to file (< 1ms latency)
    const current = getMemoryRooms();
    _memoryRooms = current.filter(r => r.id !== id);
    writeToFile(_memoryRooms);

    // Asynchronously delete from MongoDB without delaying the response
    if (isDbConnected()) {
      WarRoomModel.deleteOne({ id }).catch(err =>
        console.error('[WarRoomRepository] Mongo async delete warning:', err.message)
      );
    }

    return true;
  },

  async update(id, updates) {
    const current = getMemoryRooms();
    const idx = current.findIndex(r => r.id === id);
    let updated = null;

    if (idx !== -1) {
      current[idx] = { ...current[idx], ...updates };
      _memoryRooms = [...current];
      writeToFile(_memoryRooms);
      updated = current[idx];
    }

    if (isDbConnected()) {
      WarRoomModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).catch(err =>
        console.error('[WarRoomRepository] Mongo async update warning:', err.message)
      );
    }

    return updated;
  },
};
