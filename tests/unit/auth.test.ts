// ============================================================
//  AUTH MIDDLEWARE — JWT Unit Tests
// ============================================================

import jwt from 'jsonwebtoken';
import request from 'supertest';
import express, { Response } from 'express';
import { authMiddleware, issueToken, _testSecret } from '../../src/middleware/auth';
import { AuthenticatedRequest } from '../../src/utils/types';

// ── Minimal Express app for testing auth middleware ──────────
function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Protected test route that echoes back the decoded userId
  app.get(
    '/protected',
    authMiddleware,
    (req: AuthenticatedRequest, res: Response) => {
      res.status(200).json({
        success: true,
        userId: req.userId,
      });
    }
  );

  return app;
}

describe('JWT Auth Middleware', () => {
  const app = buildTestApp();

  describe('Valid token', () => {
    it('should succeed and populate req.userId', async () => {
      const token = issueToken('alice');

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe('alice');
    });

    it('should decode the correct userId from payload', async () => {
      const token = issueToken('bob');

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('bob');
    });
  });

  describe('Missing Authorization header', () => {
    it('should return 401 with AUTH_MISSING_TOKEN', async () => {
      const res = await request(app).get('/protected');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('should return 401 when Authorization is not Bearer scheme', async () => {
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_TOKEN');
    });
  });

  describe('Malformed token', () => {
    it('should return 401 with AUTH_MALFORMED_TOKEN for non-JWT string', async () => {
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer not-a-jwt-at-all');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTH_MALFORMED_TOKEN');
    });

    it('should return 401 for the old fake token-{userId} format', async () => {
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer token-alice');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      // Old-style tokens are just plain strings, not valid JWT
      expect(['AUTH_MALFORMED_TOKEN', 'AUTH_INVALID_SIGNATURE']).toContain(res.body.code);
    });
  });

  describe('Expired token', () => {
    it('should return 401 with AUTH_TOKEN_EXPIRED', async () => {
      // Sign a token that is already expired (negative expiresIn trick:
      // set exp to 1 second in the past)
      const token = jwt.sign({ userId: 'alice' }, _testSecret, { expiresIn: '-10s' });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTH_TOKEN_EXPIRED');
      expect(res.body.error).toContain('expired');
    });
  });

  describe('Tampered token (invalid signature)', () => {
    it('should return 401 with AUTH_INVALID_SIGNATURE', async () => {
      const validToken = issueToken('alice');
      // Tamper by flipping the last character of the signature
      const parts = validToken.split('.');
      const sig = parts[2];
      const lastChar = sig[sig.length - 1];
      const flipped = lastChar === 'a' ? 'b' : 'a';
      parts[2] = sig.slice(0, -1) + flipped;
      const tamperedToken = parts.join('.');

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTH_INVALID_SIGNATURE');
    });

    it('should return 401 when signed with a different secret', async () => {
      const wrongSecretToken = jwt.sign({ userId: 'alice' }, 'wrong-secret', { expiresIn: '1h' });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTH_INVALID_SIGNATURE');
    });
  });

  describe('issueToken', () => {
    it('should produce a valid JWT with expected payload shape', () => {
      const token = issueToken('charlie');
      const decoded = jwt.verify(token, _testSecret) as any;

      expect(decoded.userId).toBe('charlie');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it('should NOT include sensitive data in payload', () => {
      const token = issueToken('charlie');
      const decoded = jwt.decode(token) as any;

      // Only userId + iat + exp should be present
      const keys = Object.keys(decoded);
      expect(keys).toEqual(expect.arrayContaining(['userId', 'iat', 'exp']));
      expect(keys).toHaveLength(3);
    });
  });
});
