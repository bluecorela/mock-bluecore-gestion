import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { canonicalJson } from './canonical-json';

import type { UserAdminOperation } from '../../user-admin/user-admin.types';

export type LoadOperation =
  | 'stories_bulk'
  | 'sprint_create'
  | 'story_update'
  | UserAdminOperation;

type LoadInput = {
  operation: LoadOperation;
  employeeId: string;
  target: string;
  content: unknown;
};

const invalidMessage =
  'La confirmación no es válida o venció; genera la vista previa de nuevo';
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Injectable()
export class LoadConfirmationService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('LOAD_CONFIRMATION_SECRET')?.trim();
    if (secret) {
      this.secret = secret;
    } else {
      if (config.get<string>('NODE_ENV') === 'production') {
        throw new Error(
          'LOAD_CONFIRMATION_SECRET must have at least 32 characters',
        );
      }
      this.secret = randomBytes(32).toString('hex');
      new Logger(LoadConfirmationService.name).warn(
        'LOAD_CONFIRMATION_SECRET no definido; los tokens no sobreviven a un reinicio',
      );
    }
  }

  issue(input: LoadInput): { token: string; expiresAt: string } {
    let hash: string;
    try {
      hash = this.hash(input.content);
    } catch {
      throw new BadRequestException('El contenido de la carga no es válido');
    }
    const exp = Date.now() + 10 * 60 * 1000;
    const part = Buffer.from(
      JSON.stringify({
        v: 1,
        id: randomUUID(),
        op: input.operation,
        sub: input.employeeId,
        target: input.target,
        hash,
        exp,
      }),
    ).toString('base64url');
    return {
      token: `${part}.${this.signature(part).toString('base64url')}`,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  verify(token: string, expected: LoadInput): { confirmationId: string } {
    try {
      if (typeof token !== 'string') throw new Error();
      const parts = token.split('.');
      if (parts.length !== 2) throw new Error();
      const [part, signature] = parts;
      const received = this.decode(signature);
      const actual = this.signature(part);
      if (
        received.length !== actual.length ||
        !timingSafeEqual(received, actual)
      ) {
        throw new Error();
      }
      const payload: unknown = JSON.parse(this.decode(part).toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error();
      }
      const p = payload as Record<string, unknown>;
      if (
        p.v !== 1 ||
        typeof p.id !== 'string' ||
        !uuidV4.test(p.id) ||
        typeof p.op !== 'string' ||
        ![
          'stories_bulk',
          'sprint_create',
          'story_update',
          'user_create',
          'user_role',
          'user_move',
          'leader_designate',
        ].includes(p.op) ||
        typeof p.sub !== 'string' ||
        typeof p.target !== 'string' ||
        typeof p.hash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(p.hash) ||
        typeof p.exp !== 'number' ||
        !Number.isSafeInteger(p.exp) ||
        p.exp <= Date.now() ||
        p.op !== expected.operation ||
        p.sub !== expected.employeeId ||
        p.target !== expected.target ||
        p.hash !== this.hash(expected.content)
      ) {
        throw new Error();
      }
      return { confirmationId: p.id };
    } catch {
      throw new BadRequestException(invalidMessage);
    }
  }

  private hash(content: unknown): string {
    return createHash('sha256').update(canonicalJson(content)).digest('hex');
  }

  private signature(part: string): Buffer {
    return createHmac('sha256', this.secret).update(part).digest();
  }

  private decode(part: string): Buffer {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error();
    const decoded = Buffer.from(part, 'base64url');
    if (decoded.toString('base64url') !== part) throw new Error();
    return decoded;
  }
}
