// src/app/api/workspaces/route.ts
import type { NextRequest } from 'next/server';
import { forward } from './_proxy';

export const runtime = 'nodejs';

// GET /api/workspace -> proxy to GET /api/workspaces/
export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/workspaces/${qs}`);
}

// POST /api/workspace -> proxy to POST /api/workspaces/
export async function POST(req: NextRequest) {
  return forward(req, `/api/workspaces/`);
}
