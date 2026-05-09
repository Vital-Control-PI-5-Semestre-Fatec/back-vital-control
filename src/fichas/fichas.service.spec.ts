import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { FichasService } from './fichas.service';
import { Ficha } from './schema/ficha.schema';

const mockFicha = {
  emailPaciente: 'alisson.teste@vitalcontrol.com',
  tipoSanguineo: 'O+',
  peso: 80,
  altura: 1.80,
  alergias: ['Poeira'],
  condicoesPreExistentes: [],
};

// Criamos uma classe Mock que se comporta como o Model do Mongoose
class FichaModelMock {
  constructor(private data: any) {
    Object.assign(this, data);
  }
  save = jest.fn().mockResolvedValue(mockFicha);
  static findOne = jest.fn();
  static findOneAndUpdate = jest.fn();
}

describe('FichasService', () => {
  let service: FichasService;
  let model: typeof FichaModelMock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FichasService,
        {
          provide: getModelToken(Ficha.name),
          useValue: FichaModelMock, // Passamos a classe mock aqui
        },
      ],
    }).compile();

    service = module.get<FichasService>(FichasService);
    model = module.get<typeof FichaModelMock>(getModelToken(Ficha.name));
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('deve criar uma nova ficha com sucesso', async () => {
      const result = await service.create(mockFicha as any);
      expect(result).toEqual(mockFicha);
    });
  });

  describe('findByEmail', () => {
    it('deve retornar a ficha de um paciente buscado pelo email', async () => {
      // Configuramos o comportamento do método estático findOne
      FichaModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockFicha),
      } as any);

      const result = await service.findByEmail('alisson.teste@vitalcontrol.com');
      expect(result).toEqual(mockFicha);
      expect(FichaModelMock.findOne).toHaveBeenCalledWith({ emailPaciente: 'alisson.teste@vitalcontrol.com' });
    });
  });
});