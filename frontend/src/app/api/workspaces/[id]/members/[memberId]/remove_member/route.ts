// src/app/api/workspaces/[id]/members/[memberId]/remove_member/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../../_proxy';

export const runtime = 'nodejs';

// POST /api/workspace/:id/members/:memberId/remove_member
export async function POST(req: NextRequest, { params }: { params: { id: string, memberId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/members/${params.memberId}/remove_member/`);
}
