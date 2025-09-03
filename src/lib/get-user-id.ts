// src/lib/get-user-id.ts

// อ่าน cookie แบบธรรมดา (อ่านไม่ได้ถ้า HttpOnly)
const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;

  const safeName = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
  const regex = new RegExp('(?:^|; )' + safeName + '=([^;]*)');
  const match = document.cookie.match(regex);

  return match ? decodeURIComponent(match[1]) : null;
};

// แปลง Base64URL -> JSON (decode payload JWT | ไม่ verify ลายเซ็น)
const decodeJWTPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const str = decodeURIComponent(
      Array.prototype.map
        .call(json, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(str);
  } catch {
    return null;
  }
};

const isHex24 = (s: string | null): s is string => !!s && /^[0-9a-fA-F]{24}$/.test(s);
const makeHex24 = (): string =>
  Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

type IdLike = { $oid?: string; _id?: string } | string | null | undefined;

const coerceId = (v: IdLike): string | null => {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v && typeof v === 'object') {
    if (typeof v.$oid === 'string' && v.$oid) return v.$oid;
    if (typeof v._id === 'string' && v._id) return v._id;
  }
  return null;
};

/**
 * ดึง userId ที่ใช้กับ API/cart:
 * 1) localStorage('userId') ถ้าเป็น 24-hex
 * 2) ถอดจาก JWT ใน cookie 'authToken' (ถ้าอ่านได้) แล้ว cache ลง localStorage('userId')
 * 3) migrate จาก localStorage('uid') เดิม (ถ้าเป็น 24-hex)
 * 4) ไม่เจอ → สร้าง guest 24-hex แล้วเก็บลง localStorage('userId')
 */
export const getUserIdForFrontend = (): string => {
  if (typeof window === 'undefined') return '';

  // 1) from localStorage('userId')
  const stored = localStorage.getItem('userId');
  if (isHex24(stored)) return stored;

  // 2) try decode JWT cookie (if not HttpOnly)
  const token = readCookie('authToken');
  if (token) {
    const payload = decodeJWTPayload(token);
    const fromJwt =
      coerceId(payload?.userId as IdLike) ||
      coerceId(payload?.sub as IdLike) ||
      coerceId(payload?._id as IdLike);

    if (isHex24(fromJwt)) {
      localStorage.setItem('userId', fromJwt);
      return fromJwt;
    }
  }

  // 3) migrate from 'uid'
  const old = localStorage.getItem('uid');
  if (isHex24(old)) {
    localStorage.setItem('userId', old);
    return old;
  }

  // 4) fallback guest
  const guest = makeHex24();
  localStorage.setItem('userId', guest);
  return guest;
};
