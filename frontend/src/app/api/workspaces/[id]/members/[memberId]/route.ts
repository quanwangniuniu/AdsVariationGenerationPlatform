// src/app/api/workspaces/[id]/members/[memberId]/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/:id/members/:memberId
export async function GET(req: NextRequest, { params }: { params: { id: string, memberId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/members/${params.memberId}/`);
}

// PATCH /api/workspace/:id/members/:memberId
export async function PATCH(req: NextRequest, { params }: { params: { id: string, memberId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/members/${params.memberId}/`);
}

// DELETE /api/workspace/:id/members/:memberId
export async function DELETE(req: NextRequest, { params }: { params: { id: string, memberId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/members/${params.memberId}/`);
}
