/** Ordena objetos a cualquier profundidad; conserva el orden de los arrays. */
export function canonicalJson(content: unknown): string {
  return JSON.stringify(content, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(object)
          .sort()
          .filter((key) => object[key] !== undefined)
          .map((key) => [key, object[key]]),
      );
    }
    return value;
  });
}
