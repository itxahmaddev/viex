/** A random id that matches the Relay's `[A-Za-z0-9_-]{1,64}` rule. */
export function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
