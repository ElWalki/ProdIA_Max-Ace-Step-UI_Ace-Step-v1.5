import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/voices - List user's voice presets
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, audio_url, thumbnail_url, duration, created_at
       FROM voice_presets
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user!.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching voice presets:', error);
    res.status(500).json({ error: 'Failed to fetch voice presets' });
  }
});

// POST /api/voices - Save new voice preset
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, audioUrl, duration } = req.body;

    if (!name || !audioUrl) {
      res.status(400).json({ error: 'Name and audioUrl are required' });
      return;
    }

    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO voice_presets (id, user_id, name, audio_url, duration, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [id, req.user!.id, name, audioUrl, duration || null]
    );

    const result = await pool.query(
      `SELECT id, name, audio_url, thumbnail_url, duration, created_at
       FROM voice_presets
       WHERE id = ?`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating voice preset:', error);
    res.status(500).json({ error: 'Failed to create voice preset' });
  }
});

// DELETE /api/voices/:id - Delete voice preset
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const result = await pool.query(
      'SELECT user_id FROM voice_presets WHERE id = ?',
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      res.status(404).json({ error: 'Voice preset not found' });
      return;
    }

    if (result.rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to delete this voice preset' });
      return;
    }

    await pool.query('DELETE FROM voice_presets WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting voice preset:', error);
    res.status(500).json({ error: 'Failed to delete voice preset' });
  }
});

export default router;
