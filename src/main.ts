import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module'; // Verifique se o caminho está correto
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // <-- Importar o ConfigService

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 1. Configurações Globais (Pipes de Validação)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Remove propriedades que o cliente enviar e que não estiverem no DTO
    forbidNonWhitelisted: true, // Bloqueia a requisição se enviarem campos não esperados
    transform: true, // Converte automaticamente os dados da requisição para as classes dos DTOs
  }));

  // 2. Obter a instância do ConfigService para ler o .env
  const configService = app.get(ConfigService);
  
  // Lê a porta do .env. Se não existir, usa a 8000 como fallback
  const port = configService.get<number>('PORT') || 8000;

  // 3. Iniciar o servidor
  await app.listen(port);
  console.log(`Servidor rodando na porta ${port}`);
}
bootstrap();