// src/app/api/workspaces/invite/validate_token/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/invite/validate_token?token=...
export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/invite/validate_token/${qs}`);
}

// POST /api/workspace/invite/validate_token (with token in body)
export async function POST(req: NextRequest) {
  return forward(req, `/api/invite/validate_token/`);
}
