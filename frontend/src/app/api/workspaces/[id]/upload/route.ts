// src/app/api/workspaces/[id]/upload/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// POST /api/workspace/:id/upload -> proxy to POST /api/workspaces/:id/upload/
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/upload/`);
}
