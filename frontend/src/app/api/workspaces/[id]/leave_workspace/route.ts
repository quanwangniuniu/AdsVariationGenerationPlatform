// src/app/api/workspaces/[id]/leave_workspace/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// POST /api/workspace/:id/leave_workspace
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/leave_workspace/`);
}
