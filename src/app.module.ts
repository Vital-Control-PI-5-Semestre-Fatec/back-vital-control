import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Importação dos módulos de funcionalidade
import { UserModule } from './users/user.module';
import { RemediosModule } from './remedios/remedios.module';
import { FichasModule } from './fichas/fichas.module';
import { RotinaModule } from './rotina/rotina.module';
import { HistoricoModule } from './historico/historico.module';

@Module({
  imports: [
    // Carrega o arquivo .env e o torna disponível globalmente
    ConfigModule.forRoot({
      isGlobal: true, 
    }),

    // Configuração assíncrona do Mongoose
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),

    UserModule,
    RemediosModule,
    FichasModule,
    RotinaModule,
    HistoricoModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}