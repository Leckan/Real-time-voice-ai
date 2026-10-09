export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function isSafeId(id: string) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(id);
}
