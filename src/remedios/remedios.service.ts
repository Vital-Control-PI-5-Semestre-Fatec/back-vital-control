import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Remedio } from './schema/remedio.schema';
import { CreateRemedioDto } from './dto/create-remedio.dto';
import { UpdateRemedioDto } from './dto/update-remedio.dto';

type CosmosMarca = {
  name?: string;
};

type CosmosNcm = {
  code?: string;
  description?: string;
};

type CosmosGpc = {
  description?: string;
};

type CosmosProdutoResponse = {
  gtin?: string | number;
  description?: string;
  thumbnail?: string;
  brand?: CosmosMarca;
  ncm?: CosmosNcm;
  gpc?: CosmosGpc;
};

type MedicamentoCosmosNormalizado = {
  codigoBarras: string;
  nomeRemedio: string;
  marca: string;
  imagemUrl: string;
  fonteCadastro: 'COSMOS';
};

@Injectable()
export class RemediosService {
  constructor(
    @InjectModel(Remedio.name)
    private readonly remedioModel: Model<Remedio>,
  ) {}

  async create(createRemedioDto: CreateRemedioDto): Promise<Remedio> {
    return this.remedioModel.create({
      ...createRemedioDto,
      ativo: createRemedioDto.ativo ?? true,
      fonteCadastro: createRemedioDto.fonteCadastro || 'MANUAL',
    });
  }

  async findAll(): Promise<Remedio[]> {
    return this.remedioModel.find().exec();
  }

  async findOne(id: string): Promise<Remedio> {
    const remedio = await this.remedioModel.findById(id).exec();

    if (!remedio) {
      throw new NotFoundException(`Remédio com ID ${id} não encontrado`);
    }

    return remedio;
  }

  async update(
    id: string,
    updateRemedioDto: UpdateRemedioDto,
  ): Promise<Remedio> {
    const existingRemedio = await this.remedioModel
      .findByIdAndUpdate(id, updateRemedioDto, { new: true })
      .exec();

    if (!existingRemedio) {
      throw new NotFoundException(`Remédio com ID ${id} não encontrado`);
    }

    return existingRemedio;
  }

  async remove(id: string): Promise<Remedio> {
    const deletedRemedio = await this.remedioModel.findByIdAndDelete(id).exec();

    if (!deletedRemedio) {
      throw new NotFoundException(`Remédio com ID ${id} não encontrado`);
    }

    return deletedRemedio;
  }

  private limparCodigo(codigo: string): string {
    return String(codigo || '').replace(/\D/g, '');
  }

  private codigoValido(codigo: string): boolean {
    return [8, 12, 13, 14].includes(codigo.length);
  }

  private normalizarCosmos(
    data: CosmosProdutoResponse,
    codigoBarras: string,
  ): MedicamentoCosmosNormalizado {
    return {
      codigoBarras: String(data.gtin || codigoBarras),
      nomeRemedio: data.description || '',
      marca: data.brand?.name || '',
      imagemUrl: data.thumbnail || '',
      fonteCadastro: 'COSMOS',
    };
  }

  private pareceMedicamento(data: CosmosProdutoResponse): boolean {
    const ncm = String(data.ncm?.code || '');

    if (ncm.startsWith('3003') || ncm.startsWith('3004')) {
      return true;
    }

    const texto = [
      data.description,
      data.brand?.name,
      data.ncm?.description,
      data.gpc?.description,
    ]
      .filter((item): item is string => Boolean(item))
      .join(' ')
      .toLowerCase();

    const palavrasDeMedicamento = [
      'medicamento',
      'farmac',
      'comprimido',
      'cápsula',
      'capsula',
      'xarope',
      'gotas',
      'pomada',
      'solução',
      'solucao',
      'suspensão',
      'suspensao',
      'mg',
      'mcg',
      'dipirona',
      'paracetamol',
      'ibuprofeno',
      'amoxicilina',
      'loratadina',
      'omeprazol',
      'losartana',
    ];

    return palavrasDeMedicamento.some((palavra) => texto.includes(palavra));
  }

  async buscarPorCodigoBarras(codigoRecebido: string) {
    const codigoBarras = this.limparCodigo(codigoRecebido);

    if (!codigoBarras) {
      throw new BadRequestException('Código de barras obrigatório');
    }

    if (!this.codigoValido(codigoBarras)) {
      throw new BadRequestException(
        'Código inválido. Use 8, 12, 13 ou 14 números.',
      );
    }

    const remedioJaCadastrado = await this.remedioModel
      .findOne({ codigoBarras })
      .exec();

    if (remedioJaCadastrado) {
      return {
        origem: 'CACHE_REMEDIOS',
        medicamento: {
          codigoBarras: remedioJaCadastrado.codigoBarras,
          nomeRemedio: remedioJaCadastrado.nomeRemedio,
          marca: remedioJaCadastrado.marca,
          imagemUrl: remedioJaCadastrado.imagemUrl,
          fonteCadastro: remedioJaCadastrado.fonteCadastro,
        },
      };
    }

    const token = process.env.COSMOS_TOKEN;

    if (!token) {
      throw new InternalServerErrorException(
        'COSMOS_TOKEN não configurado no .env',
      );
    }

    const response = await fetch(
      `https://api.cosmos.bluesoft.com.br/gtins/${codigoBarras}.json`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Cosmos-API-Request',
          'Content-Type': 'application/json',
          'X-Cosmos-Token': token,
        },
      },
    );

    if (response.status === 404) {
      throw new NotFoundException('Código não encontrado na Cosmos');
    }

    if (response.status === 429) {
      throw new HttpException(
        'Limite diário da Cosmos excedido. Use cadastro manual.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException(
        'Token da Cosmos inválido ou sem permissão.',
      );
    }

    if (!response.ok) {
      throw new InternalServerErrorException('Erro ao consultar API Cosmos');
    }

    const data = (await response.json()) as CosmosProdutoResponse;

    if (!this.pareceMedicamento(data)) {
      throw new BadRequestException(
        'O código foi encontrado, mas não parece ser um medicamento. Use cadastro manual se necessário.',
      );
    }

    const medicamento = this.normalizarCosmos(data, codigoBarras);

    return {
      origem: 'COSMOS',
      medicamento,
    };
  }
}
