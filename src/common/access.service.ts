import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser, UserRole } from './auth';
import { CareGroup } from '../database/schemas';

@Injectable()
export class AccessService {
  constructor(@InjectModel(CareGroup.name) private readonly groups: Model<CareGroup>) {}

  async assertPatientReadAccess(user: AuthUser, patientId: string): Promise<void> {
    if (user.role === UserRole.PATIENT && user.userId === patientId) return;
    const filter =
      user.role === UserRole.CAREGIVER
        ? { caregiverIds: user.userId }
        : user.role === UserRole.CARE_MANAGER
          ? { managerId: user.userId }
          : user.role === UserRole.RESPONSIBLE
            ? { responsibleIds: user.userId }
            : null;
    if (!filter) throw new ForbiddenException('Sem acesso ao paciente');
    const allowed = await this.groups.exists({ patientId, status: 'ACTIVE', ...filter });
    if (!allowed) throw new ForbiddenException('Sem acesso ao paciente');
  }

  assertPatientWriteAccess(user: AuthUser, patientId: string): void {
    if (user.role !== UserRole.PATIENT || user.userId !== patientId) {
      throw new ForbiddenException('Somente o paciente pode alterar este recurso');
    }
  }

  objectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw new ForbiddenException('Identificador inválido');
    return new Types.ObjectId(value);
  }
}
