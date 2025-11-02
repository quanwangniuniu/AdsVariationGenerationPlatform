// src/app/api/workspaces/[id]/invitation-usage/workspace_stats/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../_proxy';

export const runtime = 'nodejs';

// GET workspace statistics
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/workspaces/${params.id}/invitation-usage/workspace_stats/${qs}`);
}
