import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "smartfaq_admin";

export function adminPassword() {
  return process.env.SMARTFAQ_ADMIN_PASSWORD ?? "aditya";
}

function secret() {
  return process.env.ADMIN_SESSION_SECRET ?? "dev-only-change-in-production";
}

export function signAdminToken(): string {
  return createHmac("sha256", secret()).update("smartfaq-admin-v1").digest("hex");
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  const good = signAdminToken();
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(good, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function adminCookieHeader(value: string, maxAgeSec: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function clearAdminCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export { COOKIE as ADMIN_COOKIE_NAME };
