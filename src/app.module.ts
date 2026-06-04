import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FichasModule } from './fichas/fichas.module';
import { HistoricoModule } from './historico/historico.module';
import { RemediosModule } from './remedios/remedios.module';
import { RotinaModule } from './rotina/rotina.module';
import { UserModule } from './users/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');

        if (!databaseUrl) {
          throw new Error('DATABASE_URL não configurado no .env');
        }

        return {
          uri: databaseUrl,
        };
      },
    }),

    UserModule,
    RotinaModule,
    RemediosModule,
    FichasModule,
    HistoricoModule,
  ],

  controllers: [],
  providers: [],
})
export class AppModule {}
