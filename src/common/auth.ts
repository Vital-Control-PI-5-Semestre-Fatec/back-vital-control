import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export enum UserRole {
  PATIENT = 'PATIENT',
  CAREGIVER = 'CAREGIVER',
  CARE_MANAGER = 'CARE_MANAGER',
  RESPONSIBLE = 'RESPONSIBLE',
}

export interface AuthUser {
  userId: string;
  role: UserRole;
}

type AuthRequest = Request & { user?: AuthUser };

const PUBLIC_KEY = 'isPublic';
const ROLES_KEY = 'roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthRequest>().user as AuthUser,
);

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createAccessToken(user: AuthUser, secret: string): string {
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({ ...user, exp: Date.now() + 7 * 86400000 }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

function verifyAccessToken(token: string, secret: string): AuthUser {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new UnauthorizedException('Token inválido');
  const expected = sign(`${header}.${payload}`, secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new UnauthorizedException('Token inválido');
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AuthUser & {
    exp: number;
  };
  if (parsed.exp < Date.now()) throw new UnauthorizedException('Token expirado');
  return { userId: parsed.userId, role: parsed.role };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) throw new UnauthorizedException('Autenticação necessária');
    request.user = verifyAccessToken(token, secret);
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.includes(request.user.role)) {
      throw new UnauthorizedException('Perfil sem permissão');
    }
    return true;
  }
}
