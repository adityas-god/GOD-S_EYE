import { Router } from 'express';
import { WarRoomRepository } from '../models/WarRoom.js';

const router = Router();

// GET all active war rooms (from MongoDB with fallback to file cache)
router.get('/', async (req, res) => {
  try {
    const warRooms = await WarRoomRepository.findAll();
    res.json({ success: true, warRooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST a new active war room (saved into MongoDB)
router.post('/', async (req, res) => {
  try {
    const { name, url, siteName, siteId, severity, lead, notes } = req.body;
    if (!name || !url) {
      return res.status(400).json({ success: false, error: 'Name and URL are required' });
    }

    const warRoom = await WarRoomRepository.create({
      name,
      url,
      siteName,
      siteId,
      severity,
      lead,
      notes,
    });

    res.status(201).json({ success: true, warRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a war room (removes from MongoDB)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await WarRoomRepository.delete(id);
    res.json({ success: true, deletedId: id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH / update a war room (updates in MongoDB)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const warRoom = await WarRoomRepository.update(id, req.body);
    if (!warRoom) {
      return res.status(404).json({ success: false, error: 'War room not found' });
    }
    res.json({ success: true, warRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
