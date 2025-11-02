// src/app/api/workspaces/[id]/transfer_ownership/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// POST /api/workspace/:id/transfer_ownership -> backend action
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/transfer_ownership/`);
}
