// src/app/api/workspaces/[id]/permissions/[permId]/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../_proxy';

export const runtime = 'nodejs';

// GET one
export async function GET(req: NextRequest, { params }: { params: { id: string, permId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/permissions/${params.permId}/`);
}

// PATCH
export async function PATCH(req: NextRequest, { params }: { params: { id: string, permId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/permissions/${params.permId}/`);
}

// DELETE
export async function DELETE(req: NextRequest, { params }: { params: { id: string, permId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/permissions/${params.permId}/`);
}
