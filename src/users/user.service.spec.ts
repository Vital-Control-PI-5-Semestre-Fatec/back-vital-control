import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserService } from './user.service';
import { User, LogType } from './schema/user.schema'; // Ajuste o caminho se necessário
import { NotFoundException } from '@nestjs/common';

// 1. Criamos um utilizador fictício para usarmos nos testes
const mockUser = {
  _id: '64a2b1c3d4e5f6a7b8c9d0e1',
  name: 'João Teste',
  email: 'joao@teste.com',
  passwordHash: 'senha_secreta_criptografada',
  logType: LogType.PACIENTE_AUTONOMO,
  createdAt: new Date(),
};

// 2. Criamos uma classe "falsa" para imitar o comportamento do Mongoose Model
class MockUserModel {
  constructor(public data: any) {
    // Copia os dados do DTO diretamente para a raiz deste objeto simulado
    Object.assign(this, data);
  }

  // Transformamos o save num método real que devolve a si mesmo (tal como o Mongoose faz)
  async save() {
    return this;
  }

  // Os métodos estáticos mantêm-se iguais
  static find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([mockUser]) });
  static findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockUser) });
  static findByIdAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockUser) });
  static findByIdAndDelete = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockUser) });
}

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    // 3. Montamos um "Módulo de Teste" isolado
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          // Dizemos ao NestJS: "Quando o UserService pedir o User Model, dê-lhe esta classe falsa"
          provide: getModelToken(User.name),
          useValue: MockUserModel,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  // TESTE 1: Verificar se o serviço foi instanciado corretamente
  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  // TESTE 2: Verificar a função findAll
  it('deve retornar um array de utilizadores', async () => {
    const result = await service.findAll();
    expect(result).toEqual([mockUser]);
    expect(MockUserModel.find).toHaveBeenCalled();
  });

  // TESTE 3: Verificar a função findOne (Sucesso)
  it('deve retornar um utilizador pelo ID', async () => {
    const result = await service.findOne('64a2b1c3d4e5f6a7b8c9d0e1');
    expect(result).toEqual(mockUser);
    expect(MockUserModel.findById).toHaveBeenCalledWith('64a2b1c3d4e5f6a7b8c9d0e1');
  });

  // TESTE 4: Verificar a função findOne (Erro / Não Encontrado)
  it('deve lançar NotFoundException se o utilizador não for encontrado', async () => {
    // Forçamos o nosso Mock a devolver null apenas neste teste
    MockUserModel.findById.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('id_invalido')).rejects.toThrow(NotFoundException);
  });

  // TESTE 5: Verificar a função create
  it('deve criar um novo utilizador', async () => {
    const createDto = {
      name: 'João Teste',
      email: 'joao@teste.com',
      password: 'senha_secreta',
      logType: LogType.PACIENTE_AUTONOMO,
    };

    const result = await service.create(createDto as any);
    
    expect(result.name).toEqual(createDto.name);
    expect(result.email).toEqual(createDto.email);
  });
});