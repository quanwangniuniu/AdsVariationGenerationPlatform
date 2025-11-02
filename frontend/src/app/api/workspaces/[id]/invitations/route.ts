// src/app/api/workspaces/[id]/invitations/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// GET invitations
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/workspaces/${params.id}/invitations/${qs}`);
}

// POST create invitation
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/invitations/`);
}
