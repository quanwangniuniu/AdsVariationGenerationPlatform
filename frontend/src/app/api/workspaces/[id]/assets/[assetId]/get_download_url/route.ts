// src/app/api/workspaces/[id]/assets/[assetId]/get_download_url/route.ts
import type { NextRequest } from 'next/server';
import { forward } from '../../../../_proxy';

export const runtime = 'nodejs';

// GET /api/workspace/:id/assets/:assetId/get_download_url -> proxy to GET /api/workspaces/:id/assets/:assetId/get_download_url/
export async function GET(req: NextRequest, { params }: { params: { id: string; assetId: string } }) {
  return forward(req, `/api/workspaces/${params.id}/assets/${params.assetId}/get_download_url/`);
}
