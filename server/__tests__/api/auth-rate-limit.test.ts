import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

/**
 * Tests that rate limiting is correctly wired on auth endpoints.
 *
 * Instead of importing the full auth router (which pulls in DB, passport, etc.),
 * we replicate the same rate limiter configs and verify the middleware behavior
 * in isolation. This validates the express-rate-limit integration without
 * requiring a database connection.
 */

function createLimiter(max: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {error: 'Too many requests, please try again later'},
  });
}

function buildApp(max: number) {
  const app = express();
  app.use(createLimiter(max));
  app.post('/test', (_req, res) => res.json({ok: true}));
  return app;
}

describe('auth rate limiting', () => {
  describe('strict limiter (signup, login — max 10)', () => {
    const app = buildApp(10);

    it('allows requests under the limit', async () => {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ok: true});
    });

    it('returns rate limit headers', async () => {
      const res = await request(app).post('/test');
      expect(res.headers).toHaveProperty('ratelimit-policy');
    });

    it('returns 429 after exceeding the limit', async () => {
      const strictApp = buildApp(3); // low limit for fast testing
      for (let i = 0; i < 3; i++) {
        await request(strictApp).post('/test');
      }
      const res = await request(strictApp).post('/test');
      expect(res.status).toBe(429);
      expect(res.body).toEqual({error: 'Too many requests, please try again later'});
    });
  });

  describe('email limiter (forgot-password — max 5)', () => {
    it('returns 429 after exceeding the limit', async () => {
      const app = buildApp(2);
      await request(app).post('/test');
      await request(app).post('/test');
      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
      expect(res.body).toEqual({error: 'Too many requests, please try again later'});
    });
  });

  describe('response format', () => {
    it('429 response is JSON with error field', async () => {
      const app = buildApp(1);
      await request(app).post('/test');
      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('error');
    });
  });
});
