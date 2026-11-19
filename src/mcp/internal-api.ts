export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class InternalApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly internalHeader: { name: string; value: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request('GET', path);
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request('POST', path, body);
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request('PATCH', path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const signal = AbortSignal.timeout(30_000);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        signal,
        headers: {
          [this.internalHeader.name]: this.internalHeader.value,
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const message = payload?.message;
        throw new ApiError(
          response.status,
          Array.isArray(message)
            ? message.join('; ')
            : (message ?? `Error de Bluecore (${response.status})`),
        );
      }
      return response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
    } catch (error) {
      if (
        signal.aborted ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'TimeoutError')
      ) {
        throw new ApiError(504, 'La API interna no respondió a tiempo');
      }
      throw error;
    }
  }
}
