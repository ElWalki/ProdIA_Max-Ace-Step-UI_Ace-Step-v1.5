import { Router, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const jwtOptions = { expiresIn: config.jwt.expiresIn } as SignOptions;

// Simple password hashing with PBKDF2 (no external deps needed)
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const verify = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
}

const router = Router();

interface SetupBody {
  username: string;
  password?: string;
}

function issueAccessToken(payload: { id: string; username: string }): string {
  return jwt.sign(payload, config.jwt.secret, jwtOptions);
}

// List all profiles (public info only \u2014 no password hashes)
router.get('/profiles', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, username, avatar_url, bio, created_at, 
       CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN 1 ELSE 0 END as has_password
       FROM users ORDER BY created_at ASC`
    );
    res.json({ profiles: result.rows.map(r => ({
      id: r.id,
      username: r.username,
      avatar_url: r.avatar_url,
      bio: r.bio,
      hasPassword: Boolean(r.has_password),
      createdAt: r.created_at,
    }))});
  } catch (error) {
    console.error('List profiles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login to existing profile
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username) { res.status(400).json({ error: 'Username is required' }); return; }

    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, password_hash, created_at FROM users WHERE username = ?',
      [username.trim()]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Profile not found' }); return; }

    const user = result.rows[0];

    // If profile has a password, verify it
    if (user.password_hash) {
      if (!password) { res.status(401).json({ error: 'Password required' }); return; }
      if (!verifyPassword(password, user.password_hash)) { res.status(401).json({ error: 'Invalid password' }); return; }
    }

    const token = issueAccessToken({ id: user.id, username: user.username });
    res.json({
      user: { id: user.id, username: user.username, bio: user.bio, avatar_url: user.avatar_url, banner_url: user.banner_url, isAdmin: Boolean(user.is_admin), createdAt: user.created_at },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auto-login: Get the default user from database (for local single-user app)
router.get('/auto', async (_req: Request, res: Response) => {
  try {
    // Get the first user from the database (local app typically has one user)
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users ORDER BY created_at ASC LIMIT 1'
    );

    if (result.rows.length === 0) {
      // No user exists yet - frontend should show username setup
      res.status(404).json({ error: 'No user found' });
      return;
    }

    const user = result.rows[0];

    // Generate token for the user
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Setup: create new profile with optional password
router.post('/setup', async (req: Request<object, object, SetupBody>, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Sanitize username
    const sanitizedUsername = username
      .trim()
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .slice(0, 50);

    if (sanitizedUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE username = ?',
      [sanitizedUsername]
    );

    if (existingUser.rows.length > 0) {
      // Profile already exists — user should use /login
      res.status(409).json({ error: 'Profile already exists. Use login instead.' });
      return;
    }

    // Create new user with optional password
    const userId = generateUUID();
    const pwHash = password ? hashPassword(password) : null;
    await pool.query(
      `INSERT INTO users (id, username, password_hash, is_admin, created_at, updated_at)
       VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
      [userId, sanitizedUsername, pwHash]
    );

    const newUser = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [userId]
    );
    const user = newUser.rows[0];

    // Generate token
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Auth setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update username
router.patch('/username', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Sanitize username
    const sanitizedUsername = username
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 50);

    if (sanitizedUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    // Check if username is taken by another user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [sanitizedUsername, req.user!.id]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    // Update username
    await pool.query(
      `UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?`,
      [sanitizedUsername, req.user!.id]
    );

    // Get updated user
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    const user = result.rows[0];

    // Issue new token with updated username
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (no-op for local app, just for API compatibility)
router.post('/logout', async (_req: Request, res: Response) => {
  res.json({ success: true });
});

// Refresh token (for API compatibility - just returns current user if token valid)
router.post('/refresh', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
