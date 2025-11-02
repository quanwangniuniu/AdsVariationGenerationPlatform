// src/app/api/workspaces/[id]/invitation-usage/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// GET usage list
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/workspaces/${params.id}/invitation-usage/${qs}`);
}
