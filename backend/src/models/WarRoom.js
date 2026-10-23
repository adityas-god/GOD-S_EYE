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
  }
);

export const WarRoomModel =
  mongoose.models.WarRoom || mongoose.model('WarRoom', warRoomSchema);

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

export const WarRoomRepository = {
  async findAll() {
    if (isDbConnected()) {
      try {
        const rooms = await WarRoomModel.find({ is_active: true })
          .sort({ startedAt: -1 })
          .lean();
        return rooms.map(r => ({
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
      } catch (err) {
        console.error('[WarRoomRepository] Mongo query error, falling back to file:', err.message);
      }
    }
    return readFromFile();
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

    if (isDbConnected()) {
      try {
        await WarRoomModel.findOneAndUpdate(
          { id: newRoom.id },
          { $set: newRoom },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error('[WarRoomRepository] Mongo create error:', err.message);
      }
    }

    // Always mirror to file cache for resiliency
    const fileRooms = readFromFile().filter(r => r.id !== newRoom.id);
    fileRooms.unshift({
      ...newRoom,
      startedAt: newRoom.startedAt.toISOString(),
    });
    writeToFile(fileRooms);

    return {
      ...newRoom,
      startedAt: newRoom.startedAt.toISOString(),
    };
  },

  async delete(id) {
    if (isDbConnected()) {
      try {
        await WarRoomModel.deleteOne({ id });
      } catch (err) {
        console.error('[WarRoomRepository] Mongo delete error:', err.message);
      }
    }

    const fileRooms = readFromFile().filter(r => r.id !== id);
    writeToFile(fileRooms);
    return true;
  },

  async update(id, updates) {
    let updatedRoom = null;
    if (isDbConnected()) {
      try {
        updatedRoom = await WarRoomModel.findOneAndUpdate(
          { id },
          { $set: updates },
          { new: true }
        ).lean();
      } catch (err) {
        console.error('[WarRoomRepository] Mongo update error:', err.message);
      }
    }

    const fileRooms = readFromFile();
    const idx = fileRooms.findIndex(r => r.id === id);
    if (idx !== -1) {
      fileRooms[idx] = { ...fileRooms[idx], ...updates };
      writeToFile(fileRooms);
      if (!updatedRoom) updatedRoom = fileRooms[idx];
    }

    return updatedRoom;
  },
};
