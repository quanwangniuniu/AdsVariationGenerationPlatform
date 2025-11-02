// src/app/api/workspaces/invite/accept_invitation/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../_proxy';

export const runtime = 'nodejs';

// POST /api/workspace/invite/accept_invitation
export async function POST(req: NextRequest) {
  return forward(req, `/api/invite/accept_invitation/`);
}
