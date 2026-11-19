import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json';

export function previewKey(
  userId: string,
  operation: string,
  target: string,
  content: unknown,
): string {
  return (
    userId +
    ':' +
    operation +
    ':' +
    target +
    ':' +
    createHash('sha256').update(canonicalJson(content)).digest('hex')
  );
}

export class PreviewCache {
  // shortcut: caché en memoria por proceso; con varias instancias, la vista previa y la confirmación pueden caer en procesos distintos; mover a un store compartido si la API escala
  private readonly entries = new Map<
    string,
    { token: string; expires: number }
  >();
  remember(key: string, token: string, expiresAt: string): void {
    const now = Date.now();
    for (const [expiredKey, entry] of this.entries) {
      if (entry.expires <= now) this.entries.delete(expiredKey);
    }
    this.entries.set(key, { token, expires: Date.parse(expiresAt) });
  }
  take(key: string): string | null {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    return entry && entry.expires > Date.now() ? entry.token : null;
  }
}
