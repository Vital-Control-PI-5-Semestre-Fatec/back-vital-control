import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './users/user.module';
import { RotinaModule } from './rotina/rotina.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('DATABASE_URL'),
      }),
    }),
    
    // 2. Coloque seus módulos novos aqui para o NestJS ativar as rotas deles!
    UserModule,
    RotinaModule,
  ],
  
  // 3. Deixamos as listas abaixo vazias, pois apagamos o AppController e o AppService
  controllers: [], 
  providers: [],   
  
})
export class AppModule {}