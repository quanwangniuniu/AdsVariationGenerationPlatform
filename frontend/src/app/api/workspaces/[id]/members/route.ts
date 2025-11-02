// src/app/api/workspaces/[id]/members/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspaces/:id/members
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const qs = req.nextUrl.search || '';
  const url = `/api/workspaces/${params.id}/members${qs}`;
  console.log('[Members GET] Forwarding to:', url);
  return forward(req, url);
}

// POST /api/workspaces/:id/members
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = `/api/workspaces/${params.id}/members/`;
  console.log('[Members POST] Forwarding to:', url);
  return forward(req, url);
}