// src/app/api/workspaces/[id]/invitations/[inviteId]/deactivate/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../../_proxy';

export const runtime = 'nodejs';

// POST deactivate an invitation
export async function POST(req: NextRequest, { params }: { params: { id: string, inviteId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/invitations/${params.inviteId}/deactivate/`);
}
