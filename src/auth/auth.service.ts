import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Model } from 'mongoose';
import { createAccessToken, UserRole } from '../common/auth';
import { User } from '../database/schemas';

const derive = promisify(pbkdf2);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 120000, 32, 'sha256');
  return `${salt}:${hash.toString('hex')}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = await derive(password, salt, 120000, 32, 'sha256');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Injectable()
export class AuthService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async register(input: { name: string; email: string; password: string; role: UserRole }) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('E-mail já cadastrado');
    const user = await this.users.create({ ...input, email, passwordHash: await hashPassword(input.password) });
    return this.response(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findOne({ email: input.email.trim().toLowerCase(), status: 'ACTIVE' });
    if (!user || !(await passwordMatches(input.password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return this.response(user);
  }

  private response(user: User & { _id: unknown }) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado');
    return {
      accessToken: createAccessToken({ userId: String(user._id), role: user.role }, secret),
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    };
  }
}
