import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
  isAdmin?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as AuthenticatedUser;
      req.user = decoded;
    } catch {
      // Token invalid, but continue without user
    }
  }

  next();
}

export async function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthenticatedUser;

    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = ?',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.user = { ...decoded, isAdmin: true };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
