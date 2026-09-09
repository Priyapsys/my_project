import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../utils/types';
import { getUser } from '../modules/users';

/** Require a live DB-backed admin role; never trust a client-supplied role. */
export async function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED', timestamp: new Date().toISOString() });
    return;
  }
  const user = await getUser(req.userId);
  if (!user || user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Administrator role required', code: 'ADMIN_REQUIRED', timestamp: new Date().toISOString() });
    return;
  }
  next();
}
