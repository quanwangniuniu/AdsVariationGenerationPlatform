// src/app/api/account/profile/route.ts
import type { NextRequest } from 'next/server';
import { BACKEND_API_BASE, trimBase, makePassthroughResponse } from '../_utils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const base = trimBase(BACKEND_API_BASE);

    const upstream = await fetch(`${base}/api/account/profile/`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie')! } : {}),
      },
    });

    const buf = await upstream.arrayBuffer();
    return makePassthroughResponse(upstream, buf);
  } catch (e: any) {
    console.error('[PROFILE] error:', e?.message || e);
    return new Response(JSON.stringify({ success: false, message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
