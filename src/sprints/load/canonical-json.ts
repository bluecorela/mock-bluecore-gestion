/** Aplica las reglas de JSON.stringify y ordena las claves recursivamente. */
export function canonicalJson(value: unknown): string {
  assertDepth(value);
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError('El contenido no se puede representar como JSON');
  }
  const normalized: unknown = JSON.parse(json);
  assertDepth(normalized);
  return serialize(normalized);
}

function serialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item: unknown) => serialize(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Cuenta contenedores: un array u objeto raíz tiene profundidad 1. */
function assertDepth(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.value === null || typeof current.value !== 'object') continue;
    const depth = current.depth + 1;
    if (depth > 32) {
      throw new RangeError('El contenido supera los 32 niveles de anidamiento');
    }
    for (const child of Object.values(current.value)) {
      pending.push({ value: child as unknown, depth });
    }
  }
}
