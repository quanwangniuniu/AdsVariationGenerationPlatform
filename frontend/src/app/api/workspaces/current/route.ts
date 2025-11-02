// src/app/api/workspaces/current/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/current -> GET /api/workspaces/current
export async function GET(req: NextRequest) {
  return forward(req, `/api/workspaces/current`);
}
