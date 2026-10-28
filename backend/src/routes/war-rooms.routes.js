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
    const { name, url, siteName, siteId, severity, lead, notes, startDate, endDate } = req.body;
    if (!name || !url) {
      return res.status(400).json({ success: false, error: 'Name and URL are required' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Start Date and End Date are required' });
    }

    const warRoom = await WarRoomRepository.create({
      name,
      url,
      siteName,
      siteId,
      severity,
      lead,
      notes,
      startDate,
      endDate,
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

// PATCH / PUT / update a war room (updates in MongoDB)
const handleUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.startDate) {
      updates.startDate = new Date(updates.startDate).toISOString();
      updates.startedAt = updates.startDate;
    }
    if (updates.endDate) {
      updates.endDate = new Date(updates.endDate).toISOString();
    }
    const warRoom = await WarRoomRepository.update(id, updates);
    if (!warRoom) {
      return res.status(404).json({ success: false, error: 'War room not found' });
    }
    res.json({ success: true, warRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

router.patch('/:id', handleUpdate);
router.put('/:id', handleUpdate);

export default router;
