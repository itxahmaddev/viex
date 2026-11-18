import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const sha256 = (value) => createHash("sha256").update(value).digest();

/**
 * Stateless password + token auth.
 *
 * Tokens are `<expiry>.<nonce>.<hmac>` signed with a key derived from
 * VIEX_PASSWORD, so the Relay needs no database and tokens survive a restart
 * (important on Render's free tier, which restarts the process after sleeping).
 */
export class Auth {
  /** @param {string} password */
  constructor(password) {
    if (!password) throw new Error("VIEX_PASSWORD is required");
    this.passwordDigest = sha256(password);
    this.signingKey = sha256(`viex-token-v1:${password}`);
    /** @type {Map<string, {count: number, resetAt: number}>} */
    this.failures = new Map();
  }

  checkPassword(candidate) {
    if (typeof candidate !== "string" || candidate.length > 512) return false;
    return timingSafeEqual(sha256(candidate), this.passwordDigest);
  }

  issueToken(now = Date.now()) {
    const payload = `${now + TOKEN_TTL_MS}.${randomBytes(8).toString("hex")}`;
    return `${payload}.${this.#sign(payload)}`;
  }

  verifyToken(token, now = Date.now()) {
    if (typeof token !== "string" || token.length > 256) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [expiry, nonce, signature] = parts;
    const expected = Buffer.from(this.#sign(`${expiry}.${nonce}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    return Number(expiry) > now;
  }

  get tokenTtlSeconds() {
    return TOKEN_TTL_MS / 1000;
  }

  /** Returns true when this client is currently blocked from guessing passwords. */
  isBlocked(ip, now = Date.now()) {
    const entry = this.failures.get(ip);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.failures.delete(ip);
      return false;
    }
    return entry.count >= 10;
  }

  recordFailure(ip, now = Date.now()) {
    const entry = this.failures.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    } else {
      entry.count += 1;
    }
  }

  clearFailures(ip) {
    this.failures.delete(ip);
  }

  #sign(payload) {
    return createHmac("sha256", this.signingKey).update(payload).digest("hex");
  }
}
