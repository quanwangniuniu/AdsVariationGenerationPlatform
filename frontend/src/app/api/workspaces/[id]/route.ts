// src/app/api/workspaces/[id]/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/:id  -> GET /api/workspaces/:id/
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/`);
}

// PATCH /api/workspace/:id -> PATCH /api/workspaces/:id/
// NOTE: backend likely makes plan read-only; this is still a generic proxy.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/`);
}

// DELETE /api/workspace/:id -> DELETE /api/workspaces/:id/
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return forward(req, `/api/workspaces/${params.id}/`);
}
