import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class InternalCallService {
  readonly headerName = 'x-bluecore-mcp-internal';
  private readonly internalSecret = randomBytes(32).toString('hex');

  secret(): string {
    return this.internalSecret;
  }

  isTrusted(request: Request): boolean {
    const header = request.headers[this.headerName];
    if (typeof header !== 'string') return false;

    const received = Buffer.from(header);
    const expected = Buffer.from(this.internalSecret);
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  }
}
