// src/app/api/workspaces/[id]/assets/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/:id/assets -> proxy to GET /api/workspaces/:id/assets/
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/workspaces/${params.id}/assets/${qs}`);
}

// POST /api/workspace/:id/assets -> proxy to POST /api/workspaces/:id/assets/
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/assets/`);
}
