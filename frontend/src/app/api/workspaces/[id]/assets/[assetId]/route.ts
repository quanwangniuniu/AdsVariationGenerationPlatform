// src/app/api/workspaces/[id]/assets/[assetId]/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/:id/assets/:assetId -> proxy to GET /api/workspaces/:id/assets/:assetId/
export async function GET(req: NextRequest, { params }: { params: { id: string; assetId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/assets/${params.assetId}/`);
}

// PATCH /api/workspace/:id/assets/:assetId -> proxy to PATCH /api/workspaces/:id/assets/:assetId/
export async function PATCH(req: NextRequest, { params }: { params: { id: string; assetId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/assets/${params.assetId}/`);
}

// DELETE /api/workspace/:id/assets/:assetId -> proxy to DELETE /api/workspaces/:id/assets/:assetId/
export async function DELETE(req: NextRequest, { params }: { params: { id: string; assetId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/assets/${params.assetId}/`);
}
