// src/app/api/workspaces/[id]/invitations/cleanup_expired/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../_proxy';

export const runtime = 'nodejs';

// POST cleanup expired invitations
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/invitations/cleanup_expired/`);
}
