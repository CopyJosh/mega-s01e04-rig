import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read-night.js';

export function registerDigestJson(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const result = readNight(config.runsDir, c.req.param('night'));

    if (!result.found) {
      return c.json({ error: 'Night not found' }, 404);
    }

    return c.json({
      rows: result.rows,
      badLines: result.badLines,
      counts: result.counts,
    });
  });
}
