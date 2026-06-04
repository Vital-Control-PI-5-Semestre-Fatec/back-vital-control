import { Controller, Get, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsIn } from 'class-validator';
import { Model } from 'mongoose';
import { UserRole } from '../common/auth';
import { User } from '../database/schemas';

const activeUserFilter = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] };

class EligibleUsersQueryDto {
  @IsIn([UserRole.PATIENT, UserRole.CAREGIVER, UserRole.RESPONSIBLE])
  role: UserRole;
}

@Controller('users')
export class UsersController {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  @Get('eligible')
  async eligible(@Query() query: EligibleUsersQueryDto) {
    const users = await this.users
      .find({ role: query.role, ...activeUserFilter })
      .select({ name: 1, email: 1, role: 1 })
      .sort({ name: 1, email: 1 })
      .lean();

    return users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  }
}
