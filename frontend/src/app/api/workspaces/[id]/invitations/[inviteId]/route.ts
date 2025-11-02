// src/app/api/workspaces/[id]/invitations/[inviteId]/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../_proxy';

export const runtime = 'nodejs';

// GET one invitation
export async function GET(req: NextRequest, { params }: { params: { id: string, inviteId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/invitations/${params.inviteId}/`);
}

// PATCH invitation
export async function PATCH(req: NextRequest, { params }: { params: { id: string, inviteId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/invitations/${params.inviteId}/`);
}

// DELETE invitation
export async function DELETE(req: NextRequest, { params }: { params: { id: string, inviteId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/invitations/${params.inviteId}/`);
}
