// app/api/account/_lib/db.ts
import { Pool } from 'pg';
import crypto from 'crypto';

export type UserRow = {
  id: number;
  password: string;
  last_login: Date | null;
  is_superuser: boolean;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  date_joined: Date;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toPublic(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    created_at: u.date_joined?.toISOString(),
  };
}

// ===== Django pbkdf2_sha256 helpers =====
function base64(b: Buffer) { return b.toString('base64'); }
function genSalt(len = 12) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
function parseDjangoHash(encoded: string) {
  // pbkdf2_sha256$260000$salt$hash
  const parts = encoded.split('$');
  if (parts.length !== 4) return null;
  const [algo, iterStr, salt, hash] = parts;
  const iterations = parseInt(iterStr, 10);
  if (algo !== 'pbkdf2_sha256' || !salt || !hash || !Number.isFinite(iterations)) return null;
  return { iterations, salt, hash };
}
export function djangoHashPassword(password: string, iterations = 260000) {
  const salt = genSalt(12);
  const dk = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt}$${base64(dk)}`;
}
export function djangoVerifyPassword(password: string, encoded: string) {
  const parsed = parseDjangoHash(encoded);
  if (!parsed) return false; // 仅支持 pbkdf2_sha256
  const { iterations, salt, hash } = parsed;
  const dk = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const calc = base64(dk);
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

export const db = {
  async findByUsernameOrEmail(identifier: string): Promise<UserRow | null> {
    const lower = identifier.toLowerCase();
    const { rows } = await pool.query<UserRow>(
      `SELECT * FROM auth_user WHERE lower(username)= $1 OR lower(email)= $1 LIMIT 1`,
      [lower]
    );
    return rows[0] || null;
  },
  async findById(id: number): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(`SELECT * FROM auth_user WHERE id=$1 LIMIT 1`, [id]);
    return rows[0] || null;
  },
  async usernameExists(username: string) {
    const { rows } = await pool.query(`SELECT 1 FROM auth_user WHERE lower(username)=lower($1)`, [username]);
    return !!rows[0];
  },
  async emailExists(email: string, exceptUserId?: number) {
    const params: any[] = [email];
    let sql = `SELECT id FROM auth_user WHERE lower(email)=lower($1)`;
    if (exceptUserId) { sql += ` AND id <> $2`; params.push(exceptUserId); }
    const { rows } = await pool.query(sql, params);
    return !!rows[0];
  },
  async createUser(data: { username: string; email: string; first_name?: string; last_name?: string; password: string; }) {
    const hash = djangoHashPassword(data.password);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO auth_user (password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
       VALUES ($1, NULL, FALSE, $2, $3, $4, $5, FALSE, TRUE, NOW())
       RETURNING *`,
      [hash, data.username, data.first_name || '', data.last_name || '', data.email]
    );
    return rows[0];
  },
  async updateUser(id: number, patch: Partial<Pick<UserRow, 'email' | 'first_name' | 'last_name'>>) {
    const u = await this.findById(id);
    if (!u) return null;
    const email = patch.email ?? u.email;
    const first_name = patch.first_name ?? u.first_name;
    const last_name = patch.last_name ?? u.last_name;
    const { rows } = await pool.query<UserRow>(
      `UPDATE auth_user SET email=$1, first_name=$2, last_name=$3 WHERE id=$4 RETURNING *`,
      [email, first_name, last_name, id]
    );
    return rows[0] || null;
  },
  async updatePassword(id: number, newPassword: string) {
    const hash = djangoHashPassword(newPassword);
    const { rows } = await pool.query<UserRow>(
      `UPDATE auth_user SET password=$1 WHERE id=$2 RETURNING *`,
      [hash, id]
    );
    return rows[0] || null;
  },
  async verifyPassword(row: UserRow, password: string) {
    return djangoVerifyPassword(password, row.password);
  },
  async touchLastLogin(id: number) {
    await pool.query(`UPDATE auth_user SET last_login=NOW() WHERE id=$1`, [id]);
  },
};

export function sanitize(row: UserRow) { return toPublic(row); }
