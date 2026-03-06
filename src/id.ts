function compactUuid(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function prefixedId(prefix: string, length: number): string {
  return `${prefix}${compactUuid().substring(0, length)}`;
}

export function shortId(length = 16): string {
  return compactUuid().substring(0, length);
}
