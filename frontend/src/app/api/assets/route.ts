// src/app/api/assets/route.ts
import type { NextRequest } from 'next/server';
import { forward } from './_proxy';

export const runtime = 'nodejs';

// GET /api/assets -> proxy to GET /api/assets/
export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search || '';
  return forward(req, `/api/assets/${qs}`);
}

// POST /api/assets -> proxy to POST /api/assets/
export async function POST(req: NextRequest) {
  return forward(req, `/api/assets/`);
}
