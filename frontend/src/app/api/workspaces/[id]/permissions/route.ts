// src/app/api/workspaces/[id]/permissions/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspaces/:id/permissions
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const qs = req.nextUrl.search || '';
  const url = `/api/workspaces/${params.id}/permissions${qs}`;
  console.log('[Permissions GET] Forwarding to:', url);
  return forward(req, url);
}

// POST /api/workspaces/:id/permissions
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = `/api/workspaces/${params.id}/permissions/`;
  console.log('[Permissions POST] Forwarding to:', url);
  return forward(req, url);
}