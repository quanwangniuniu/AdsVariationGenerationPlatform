// app/api/account/_lib/utils.ts
import { NextRequest, NextResponse } from 'next/server';

export function jsonOk(data: any, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...(init || {}) });
}
export function jsonBadRequest(data: any) {
  return NextResponse.json(data, { status: 400 });
}
export function jsonUnauthorized(data: any) {
  return NextResponse.json(data, { status: 401 });
}
export function jsonForbidden(data: any) {
  return NextResponse.json(data, { status: 403 });
}

export function parseAuthToken(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  const parts = h.split(' ');
  if (parts.length === 2) {
    const [scheme, token] = parts;
    if (/^token$/i.test(scheme) || /^bearer$/i.test(scheme)) return token;
  }
  return '';
}

export function fieldError(field: string, msg: string) {
  return { success: false, errors: { [field]: [msg] } };
}
export function messageError(msg: string) {
  return { success: false, message: msg };
}
