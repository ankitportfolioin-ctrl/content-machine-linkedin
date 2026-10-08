import type { Request, Response } from 'express';
import { createApp } from '../apps/api/src/app';

// Single Express instance per warm function (module scope). Serverless hosts
// invoke it per request instead of binding a port — see apps/api/src/app.ts.
// The pg-boss worker is never started here; only request handlers run.
// Bundle-buster: forces a fresh function bundle on redeploy.
const app = createApp();

export default function handler(req: Request, res: Response): void {
  app(req, res);
}
