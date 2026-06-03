# Vital Control API

Documentacao da API REST usada pelo aplicativo Vital Control.

O sistema permite acompanhar medicamentos, estoque, rotinas, administracoes e
atendimentos domiciliares. Existem quatro perfis de conta:

| Perfil | Uso principal |
| --- | --- |
| `PATIENT` | gerencia sua ficha, medicamentos, estoque, rotinas e solicitacoes |
| `CAREGIVER` | acompanha atendimentos atribuidos e registra doses durante uma visita |
| `CARE_MANAGER` | cria grupos, organiza cuidadores e agenda atendimentos |
| `RESPONSIBLE` | acompanha medicamentos, estoque e relatorios de pacientes vinculados |

## 1. Inicio rapido

### Requisitos

- Node.js 20 ou superior;
- MongoDB local ou MongoDB Atlas;
- arquivo `.env` configurado.

### Executar

```bash
npm install
npm run start:dev
```

Base URL local:

```text
http://localhost:3000/api
```

Validar compilacao:

```bash
npm run build
```

As instrucoes detalhadas para configurar o banco estao em
[MONGODB.md](./MONGODB.md). O planejamento funcional mais amplo esta em
[API.md](./API.md).

## 2. Variaveis de ambiente

Crie `.env` a partir de `.env.example`:

```env
PORT=3000
DATABASE_URL=mongodb://localhost:27017/vital_control
JWT_SECRET=sua-chave-longa-e-aleatoria

EXPO_ACCESS_TOKEN=

COSMOS_API_URL=https://api.cosmos.bluesoft.com.br
COSMOS_API_TOKEN=
COSMOS_USER_AGENT=

ANVISA_MEDICATIONS_CSV_URL=
```

Obrigatorias para iniciar a API:

| Variavel | Uso |
| --- | --- |
| `DATABASE_URL` | conexao MongoDB |
| `JWT_SECRET` | assinatura dos tokens de acesso |

As demais variaveis pertencem a integracoes externas ainda nao expostas por
endpoints nesta versao.

## 3. Convencoes do contrato

### Cabecalho de autenticacao

Somente cadastro e login sao publicos. Nas demais requisicoes envie:

```http
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

### Identificadores

Todos os campos `_id`, `patientId`, `medicationId`, `scheduleId`, `careGroupId` e
`assignedCaregiverId` sao strings no formato `ObjectId` do MongoDB.

### Datas

- envie datas em ISO 8601;
- a API persiste datas em UTC;
- o aplicativo deve exibir datas no fuso do usuario;
- o fuso padrao da ficha e `America/Sao_Paulo`.

Exemplo:

```text
2026-06-01T12:30:00.000Z
```

### Erros

Formato padrao retornado pelo NestJS:

```json
{
  "statusCode": 400,
  "message": "Descricao do erro",
  "error": "Bad Request"
}
```

Erros comuns:

| HTTP | Significado |
| --- | --- |
| `400` | payload invalido ou regra de negocio violada |
| `401` | token ausente, expirado ou perfil sem permissao |
| `403` | usuario autenticado sem acesso ao paciente |
| `404` | recurso nao encontrado |
| `409` | e-mail ja cadastrado |

### Campos automaticos

Documentos com timestamps incluem:

```json
{
  "_id": "ObjectId",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "__v": 0
}
```

O frontend pode ignorar `__v`.

## 4. Autenticacao

O token de acesso possui validade de 7 dias. O aplicativo deve armazenar o token
em armazenamento seguro e redirecionar para login ao receber `401`.

### `POST /auth/register`

Cria uma conta. Rota publica.

Payload:

```json
{
  "name": "Beatriz Lima",
  "email": "beatriz@example.com",
  "password": "senha-segura",
  "role": "PATIENT"
}
```

Regras:

- `password` deve possuir no minimo 8 caracteres;
- `email` deve ser valido e unico;
- `role`: `PATIENT`, `CAREGIVER`, `CARE_MANAGER` ou `RESPONSIBLE`.

Resposta:

```json
{
  "accessToken": "TOKEN",
  "user": {
    "id": "ObjectId",
    "name": "Beatriz Lima",
    "email": "beatriz@example.com",
    "role": "PATIENT"
  }
}
```

### `POST /auth/login`

Entra com e-mail e senha. Rota publica.

Payload:

```json
{
  "email": "beatriz@example.com",
  "password": "senha-segura"
}
```

Resposta: mesmo formato de `/auth/register`.

### `GET /auth/me`

Retorna os dados gravados no token.

Resposta:

```json
{
  "userId": "ObjectId",
  "role": "PATIENT"
}
```

## 5. Ficha do paciente

### `GET /patients/:patientId/profile`

Consulta a ficha.

Podem consultar:

- o proprio paciente;
- cuidador vinculado a um grupo ativo;
- gerente do grupo ativo;
- responsavel vinculado ao grupo ativo.

Atencao: nesta versao, usuarios vinculados recebem o documento completo. Antes
da publicacao, o backend deve criar respostas especificas por perfil. O frontend
nao deve exibir campos clinicos ao cuidador nem usar este endpoint para mostrar o
nome completo do paciente.

Resposta:

```json
{
  "_id": "ObjectId",
  "patientId": "ObjectId",
  "bloodType": "O+",
  "weightKg": 62.5,
  "heightCm": 165,
  "allergies": ["Dipirona"],
  "preExistingConditions": ["Hipertensao"],
  "defaultAddress": {
    "street": "Rua das Flores",
    "number": "120",
    "neighborhood": "Centro",
    "city": "Sao Paulo",
    "state": "SP",
    "zipCode": "01001000"
  },
  "timezone": "America/Sao_Paulo"
}
```

Pode retornar `null` quando o paciente ainda nao cadastrou a ficha.

### `PUT /patients/:patientId/profile`

Cria ou atualiza a ficha. Somente o proprio `PATIENT`.

Todos os campos sao opcionais:

```json
{
  "bloodType": "O+",
  "weightKg": 62.5,
  "heightCm": 165,
  "allergies": ["Dipirona"],
  "preExistingConditions": ["Hipertensao"],
  "defaultAddress": {
    "street": "Rua das Flores",
    "number": "120",
    "city": "Sao Paulo",
    "state": "SP",
    "zipCode": "01001000"
  },
  "timezone": "America/Sao_Paulo"
}
```

## 6. Medicamentos e estoque

### Enums

Origem do cadastro:

```text
MANUAL | COSMOS | ANVISA | COSMOS_ANVISA
```

Tipos de movimentacao manual:

```text
PURCHASE | MANUAL_ADJUSTMENT_IN | MANUAL_ADJUSTMENT_OUT | DISCARD
```

A API tambem registra automaticamente:

```text
INITIAL_BALANCE | ADMINISTRATION
```

### `GET /patients/:patientId/medications`

Lista medicamentos do paciente.

Podem consultar usuarios com acesso de leitura ao paciente.

Resposta:

```json
[
  {
    "_id": "ObjectId",
    "patientId": "ObjectId",
    "name": "Losartana",
    "dosageDescription": "50 mg",
    "barcode": "7890000000000",
    "brand": "Marca Exemplo",
    "notes": "Tomar com agua",
    "registrationSource": "MANUAL",
    "stock": {
      "currentQuantity": 28,
      "unit": "TABLET",
      "lowStockThreshold": 7
    },
    "active": true
  }
]
```

O frontend deve destacar estoque baixo quando:

```text
stock.currentQuantity <= stock.lowStockThreshold
```

### `POST /patients/:patientId/medications`

Cadastra medicamento. Somente o proprio `PATIENT`.

Payload:

```json
{
  "name": "Losartana",
  "dosageDescription": "50 mg",
  "unit": "TABLET",
  "currentQuantity": 30,
  "lowStockThreshold": 7,
  "barcode": "7890000000000",
  "brand": "Marca Exemplo",
  "notes": "Tomar com agua",
  "registrationSource": "MANUAL"
}
```

Regras:

- `name`, `dosageDescription` e `unit` sao obrigatorios;
- o saldo aceita fracoes, como `2.5`;
- saldo inicial e limite de estoque nao podem ser negativos;
- saldo inicial positivo cria uma movimentacao `INITIAL_BALANCE`.

### `PATCH /patients/:patientId/medications/:medicationId/stock`

Registra entrada ou saida manual. Somente o proprio `PATIENT`.

Payload:

```json
{
  "type": "PURCHASE",
  "quantity": 20,
  "reason": "Compra mensal"
}
```

Regras:

- `quantity` deve ser maior que zero;
- o estoque nunca pode ficar negativo;
- `reason` e recomendado para ajustes e descarte.

### `GET /patients/:patientId/medications/:medicationId/movements`

Lista o historico de estoque em ordem decrescente.

Resposta:

```json
[
  {
    "_id": "ObjectId",
    "patientId": "ObjectId",
    "medicationId": "ObjectId",
    "type": "PURCHASE",
    "direction": "IN",
    "quantity": 20,
    "stockBefore": 10,
    "stockAfter": 30,
    "reason": "Compra mensal",
    "performedByUserId": "ObjectId",
    "occurredAt": "2026-06-01T12:00:00.000Z"
  }
]
```

## 7. Rotinas e administracoes

### Status da administracao

```text
PENDING | TAKEN_ON_TIME | TAKEN_LATE | MISSED | SKIPPED
```

Regras:

- `TAKEN_ON_TIME`: registrada ate o horario previsto;
- `TAKEN_LATE`: registrada depois do horario e em ate 24 horas;
- `MISSED`: pendente por mais de 24 horas;
- ao registrar dose tomada, o estoque sofre baixa automatica;
- uma dose concluida nao pode ser concluida novamente.

### `GET /patients/:patientId/schedules`

Lista rotinas do paciente.

Resposta:

```json
[
  {
    "_id": "ObjectId",
    "patientId": "ObjectId",
    "medicationId": "ObjectId",
    "title": "Losartana da manha",
    "dose": {
      "quantity": 1,
      "unit": "TABLET"
    },
    "times": ["08:00"],
    "recurrence": {
      "type": "DAILY"
    },
    "startDate": "2026-06-01T00:00:00.000Z",
    "timezone": "America/Sao_Paulo",
    "instructions": "Apos o cafe",
    "active": true
  }
]
```

Recorrencias planejadas para o aplicativo:

```text
DAILY | WEEKDAYS | INTERVAL_DAYS
```

Exemplos:

```json
{ "type": "DAILY" }
```

```json
{ "type": "WEEKDAYS", "weekdays": [1, 3, 5] }
```

```json
{ "type": "INTERVAL_DAYS", "intervalDays": 2 }
```

### `POST /patients/:patientId/schedules`

Cria rotina. Somente o proprio `PATIENT`.

Payload:

```json
{
  "medicationId": "ObjectId",
  "title": "Losartana da manha",
  "dose": {
    "quantity": 1,
    "unit": "TABLET"
  },
  "times": ["08:00"],
  "recurrence": {
    "type": "DAILY"
  },
  "startDate": "2026-06-01T00:00:00.000Z",
  "timezone": "America/Sao_Paulo",
  "instructions": "Apos o cafe"
}
```

O medicamento deve estar ativo e pertencer ao paciente.

### `POST /patients/:patientId/schedules/:scheduleId/occurrences`

Materializa uma ocorrencia prevista da rotina. Somente o proprio `PATIENT`.

Payload:

```json
{
  "scheduledFor": "2026-06-01T11:00:00.000Z"
}
```

Esta rota e idempotente por combinacao de rotina e horario. Criar duas vezes o
mesmo horario retorna a mesma ocorrencia.

### `GET /patients/:patientId/administrations`

Lista historico de doses em ordem decrescente. Ao consultar, ocorrencias pendentes
ha mais de 24 horas sao atualizadas para `MISSED`.

Resposta:

```json
[
  {
    "_id": "ObjectId",
    "patientId": "ObjectId",
    "scheduleId": "ObjectId",
    "medicationId": "ObjectId",
    "scheduledFor": "2026-06-01T11:00:00.000Z",
    "status": "PENDING",
    "medicationSnapshot": {
      "name": "Losartana",
      "dosageDescription": "50 mg",
      "dose": {
        "quantity": 1,
        "unit": "TABLET"
      }
    }
  }
]
```

### `PATCH /patients/:patientId/administrations/:administrationId/take`

Registra a dose como tomada.

Podem executar:

- o proprio `PATIENT`;
- `CAREGIVER` vinculado ao paciente com atendimento `IN_PROGRESS`.

Payload:

```json
{
  "notes": "Administrado durante visita"
}
```

Resposta: administracao com `TAKEN_ON_TIME` ou `TAKEN_LATE`.

## 8. Grupos de cuidado

Um grupo relaciona um paciente, um gerente, cuidadores e responsaveis.

### `GET /care-groups/mine`

Lista grupos ativos relacionados ao usuario autenticado.

Resposta:

```json
[
  {
    "_id": "ObjectId",
    "name": "Grupo Beatriz Lima",
    "patientId": "ObjectId",
    "managerId": "ObjectId",
    "caregiverIds": ["ObjectId"],
    "responsibleIds": ["ObjectId"],
    "status": "ACTIVE"
  }
]
```

O frontend usa `patientId` para carregar medicamentos, estoque, rotinas e
relatorios permitidos.

### `POST /care-groups`

Cria grupo. Somente `CARE_MANAGER`.

Payload:

```json
{
  "name": "Grupo Beatriz Lima",
  "patientId": "ObjectId"
}
```

### `PATCH /care-groups/:id/members`

Substitui listas de membros. Somente o gerente dono do grupo.

Payload:

```json
{
  "caregiverIds": ["ObjectId"],
  "responsibleIds": ["ObjectId"]
}
```

## 9. Atendimentos domiciliares

### Status

Status existentes no fluxo de negocio:

```text
REQUESTED | TRIAGED | SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW
```

Na versao atual:

- nova solicitacao recebe `REQUESTED`;
- atribuicao pelo gerente altera para `SCHEDULED`;
- cuidador pode alterar para `IN_PROGRESS`, `COMPLETED` ou `NO_SHOW`.

### `POST /home-visits`

Paciente solicita atendimento. Somente `PATIENT`.

Payload:

```json
{
  "reason": "Preciso de auxilio com a medicacao",
  "patientNotes": "Interfone 12",
  "requestedWindow": {
    "start": "2026-06-02T12:00:00.000Z",
    "end": "2026-06-02T15:00:00.000Z"
  },
  "addressSnapshot": {
    "street": "Rua das Flores",
    "number": "120",
    "city": "Sao Paulo",
    "state": "SP",
    "zipCode": "01001000"
  }
}
```

O endereco e copiado para preservar o historico.

### `GET /home-visits/mine`

Lista atendimentos relacionados a conta:

| Perfil | Resultado |
| --- | --- |
| `PATIENT` | solicitacoes criadas pelo paciente |
| `CAREGIVER` | atendimentos atribuidos ao cuidador |
| `CARE_MANAGER` | atendimentos ja associados ao gerente |
| `RESPONSIBLE` | lista vazia na versao atual |

Resposta:

```json
[
  {
    "_id": "ObjectId",
    "patientId": "ObjectId",
    "careGroupId": "ObjectId",
    "managerId": "ObjectId",
    "assignedCaregiverId": "ObjectId",
    "reason": "Preciso de auxilio com a medicacao",
    "patientNotes": "Interfone 12",
    "requestedWindow": {
      "start": "2026-06-02T12:00:00.000Z",
      "end": "2026-06-02T15:00:00.000Z"
    },
    "scheduledWindow": {
      "start": "2026-06-02T13:00:00.000Z",
      "end": "2026-06-02T14:00:00.000Z"
    },
    "addressSnapshot": {
      "street": "Rua das Flores",
      "number": "120"
    },
    "status": "SCHEDULED"
  }
]
```

### `PATCH /home-visits/:id/assign`

Gerente agenda visita e atribui cuidador. Somente `CARE_MANAGER`.

Payload:

```json
{
  "careGroupId": "ObjectId",
  "assignedCaregiverId": "ObjectId",
  "scheduledWindow": {
    "start": "2026-06-02T13:00:00.000Z",
    "end": "2026-06-02T14:00:00.000Z"
  }
}
```

O cuidador deve pertencer ao grupo ativo e a visita deve pertencer ao paciente
do grupo.

### `PATCH /home-visits/:id/status`

Cuidador atualiza atendimento atribuido a ele. Somente `CAREGIVER`.

Payload:

```json
{
  "status": "IN_PROGRESS",
  "caregiverNotes": "Atendimento iniciado"
}
```

Valores aceitos nesta rota:

```text
IN_PROGRESS | COMPLETED | NO_SHOW
```

## 10. Dispositivos de notificacao

O aplicativo deve obter um `ExpoPushToken` no dispositivo e cadastra-lo na API.
Esta versao persiste tokens, mas ainda nao dispara notificacoes automaticamente.

### `GET /notification-devices`

Lista dispositivos ativos da conta autenticada.

### `POST /notification-devices`

Cadastra ou reativa dispositivo.

Payload:

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ANDROID",
  "deviceName": "Celular principal"
}
```

Plataformas aceitas:

```text
ANDROID | IOS | WEB
```

### `DELETE /notification-devices/:pushToken`

Desativa o token do dispositivo.

## 11. Matriz de permissoes

| Recurso | `PATIENT` | `CAREGIVER` | `CARE_MANAGER` | `RESPONSIBLE` |
| --- | --- | --- | --- | --- |
| propria ficha | ler e editar | - | - | - |
| ficha de paciente vinculado | - | ler | ler | ler |
| medicamentos e estoque vinculados | ler, cadastrar e ajustar os proprios | ler | ler | ler |
| rotinas vinculadas | ler e criar as proprias | ler | ler | ler |
| historico vinculado | ler | ler | ler | ler |
| registrar dose tomada | sim | durante visita em andamento | nao | nao |
| grupos | listar os proprios | listar vinculados | criar e editar proprios | listar vinculados |
| solicitar visita | sim | nao | nao | nao |
| agendar visita | nao | nao | sim | nao |
| atualizar andamento da visita | nao | sim | nao | nao |
| dispositivos push da propria conta | gerenciar | gerenciar | gerenciar | gerenciar |

## 12. Telas sugeridas para o frontend

### Telas compartilhadas

| Tela | Endpoints |
| --- | --- |
| cadastro | `POST /auth/register` |
| login | `POST /auth/login` |
| carregamento da sessao | `GET /auth/me` |
| dispositivos e notificacoes | `GET`, `POST`, `DELETE /notification-devices` |

### Paciente

| Tela | Endpoints |
| --- | --- |
| inicio com proximas doses | `GET /patients/:id/administrations` |
| minha ficha | `GET`, `PUT /patients/:id/profile` |
| medicamentos | `GET`, `POST /patients/:id/medications` |
| detalhe do medicamento | `GET /patients/:id/medications/:medicationId/movements` |
| ajustar estoque | `PATCH /patients/:id/medications/:medicationId/stock` |
| rotinas | `GET`, `POST /patients/:id/schedules` |
| historico de doses | `GET /patients/:id/administrations` |
| registrar dose tomada | `PATCH /patients/:id/administrations/:administrationId/take` |
| solicitar atendimento | `POST /home-visits` |
| meus atendimentos | `GET /home-visits/mine` |

### Cuidador

| Tela | Endpoints |
| --- | --- |
| agenda | `GET /home-visits/mine` |
| detalhe da visita | dados retornados por `GET /home-visits/mine` |
| iniciar ou concluir visita | `PATCH /home-visits/:id/status` |
| grupos vinculados | `GET /care-groups/mine` |
| medicamentos do paciente | `GET /patients/:patientId/medications` |
| registrar dose durante visita | `PATCH /patients/:patientId/administrations/:id/take` |

### Gerente

| Tela | Endpoints |
| --- | --- |
| grupos gerenciados | `GET /care-groups/mine` |
| criar grupo | `POST /care-groups` |
| editar membros | `PATCH /care-groups/:id/members` |
| agenda gerenciada | `GET /home-visits/mine` |
| atribuir cuidador | `PATCH /home-visits/:id/assign` |

### Responsavel

| Tela | Endpoints |
| --- | --- |
| pacientes vinculados | `GET /care-groups/mine` |
| medicamentos | `GET /patients/:patientId/medications` |
| estoque | `GET /patients/:patientId/medications` e movimentacoes |
| relatorio de administracoes | `GET /patients/:patientId/administrations` |

## 13. Fluxos recomendados no aplicativo

### Primeiro acesso do paciente

1. Cadastrar ou entrar.
2. Usar `user.id` retornado pelo login como `patientId`.
3. Preencher a ficha.
4. Cadastrar medicamentos e saldo inicial.
5. Criar rotinas.
6. Registrar dispositivo push.

### Exibir proxima dose

1. Consultar `/patients/:patientId/administrations`.
2. Filtrar `status === "PENDING"`.
3. Ordenar por `scheduledFor`.
4. Destacar doses com horario ultrapassado como atrasadas.
5. Permitir registrar dose enquanto nao tiver passado 24 horas.

### Atendimento domiciliar

1. Paciente cria solicitacao.
2. Gerente associa grupo, cuidador e horario.
3. Cuidador consulta agenda.
4. Cuidador altera para `IN_PROGRESS`.
5. Durante a visita, cuidador pode registrar dose tomada.
6. Cuidador conclui com `COMPLETED` ou registra `NO_SHOW`.

## 14. Modelagem MongoDB

As colecoes sao criadas automaticamente pelo Mongoose quando usadas.

### Relacionamentos

```text
users
  |-- 1:0..1 --> patient_profiles
  |-- 1:N ----> medications
  |-- 1:N ----> medication_schedules
  |-- 1:N ----> medication_administrations
  |-- N:N ----> care_groups
  |-- 1:N ----> home_visits
  |-- 1:N ----> notification_devices

medications
  |-- 1:N ----> stock_movements

home_visits
  |-- 1:N ----> home_visit_events

users and sensitive resources
  |-- 1:N ----> audit_logs
```

### `users`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `name` | `string` | nome da pessoa |
| `email` | `string` | unico, normalizado |
| `passwordHash` | `string` | nunca retornar ao frontend |
| `role` | `enum` | perfil principal |
| `status` | `enum` | `ACTIVE`, `SUSPENDED`, `INACTIVE` |

### `patient_profiles`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `patientId` | `ObjectId` | unico |
| `bloodType` | `string` | tipo sanguineo |
| `weightKg` | `number` | aceita fracao |
| `heightCm` | `number` | altura |
| `allergies` | `string[]` | padrao `[]` |
| `preExistingConditions` | `string[]` | padrao `[]` |
| `defaultAddress` | `object` | endereco para solicitar visitas |
| `timezone` | `string` | padrao `America/Sao_Paulo` |

### `medications`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `patientId` | `ObjectId` | dono |
| `name` | `string` | nome exibido |
| `dosageDescription` | `string` | exemplo: `50 mg` |
| `barcode` | `string?` | GTIN ou EAN |
| `brand` | `string?` | marca |
| `imageUrl` | `string?` | imagem |
| `notes` | `string?` | observacoes |
| `registrationSource` | `enum` | origem |
| `stock.currentQuantity` | `number` | saldo atual |
| `stock.unit` | `string` | unidade |
| `stock.lowStockThreshold` | `number?` | limite de alerta |
| `active` | `boolean` | desativacao logica |

### `stock_movements`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `patientId` | `ObjectId` | paciente |
| `medicationId` | `ObjectId` | medicamento |
| `type` | `string` | motivo da movimentacao |
| `direction` | `IN \| OUT` | entrada ou saida |
| `quantity` | `number` | valor positivo |
| `stockBefore` | `number` | saldo anterior |
| `stockAfter` | `number` | saldo posterior |
| `administrationId` | `ObjectId?` | baixa automatica |
| `reason` | `string?` | justificativa |
| `performedByUserId` | `ObjectId` | autor |
| `occurredAt` | `date` | momento |

### `medication_schedules`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `patientId` | `ObjectId` | paciente |
| `medicationId` | `ObjectId` | medicamento |
| `title` | `string` | titulo amigavel |
| `dose` | `object` | quantidade e unidade |
| `times` | `string[]` | formato `HH:mm` |
| `recurrence` | `object` | regra de repeticao |
| `startDate` | `date` | inicio |
| `endDate` | `date?` | fim opcional |
| `timezone` | `string` | fuso |
| `instructions` | `string?` | instrucoes |
| `active` | `boolean` | desativacao logica |

### `medication_administrations`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `patientId` | `ObjectId` | paciente |
| `scheduleId` | `ObjectId` | rotina |
| `medicationId` | `ObjectId` | medicamento |
| `scheduledFor` | `date` | horario previsto |
| `status` | `enum` | situacao |
| `completedAt` | `date?` | conclusao real |
| `performedByUserId` | `ObjectId?` | autor da conclusao |
| `notes` | `string?` | observacoes |
| `medicationSnapshot` | `object` | historico imutavel da dose |

### `care_groups`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `name` | `string` | nome interno |
| `patientId` | `ObjectId` | paciente |
| `managerId` | `ObjectId` | gerente |
| `caregiverIds` | `ObjectId[]` | cuidadores |
| `responsibleIds` | `ObjectId[]` | responsaveis |
| `status` | `ACTIVE \| INACTIVE` | estado |

### `home_visits`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `patientId` | `ObjectId` | solicitante |
| `careGroupId` | `ObjectId?` | grupo atribuido |
| `managerId` | `ObjectId?` | gerente |
| `assignedCaregiverId` | `ObjectId?` | cuidador |
| `reason` | `string` | motivo |
| `patientNotes` | `string?` | observacoes do paciente |
| `caregiverNotes` | `string?` | observacoes do cuidador |
| `requestedWindow` | `object` | janela desejada |
| `scheduledWindow` | `object?` | janela confirmada |
| `addressSnapshot` | `object` | endereco historico |
| `status` | `string` | situacao |

### `home_visit_events`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `homeVisitId` | `ObjectId` | visita |
| `type` | `string` | `CREATED`, `ASSIGNED` ou `STATUS_CHANGED` |
| `performedByUserId` | `ObjectId` | autor |
| `occurredAt` | `date` | momento |
| `details` | `object` | dados da alteracao |

### `notification_devices`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `userId` | `ObjectId` | dono |
| `pushToken` | `string` | unico |
| `platform` | `ANDROID \| IOS \| WEB` | plataforma |
| `deviceName` | `string?` | nome amigavel |
| `active` | `boolean` | desativacao logica |

### `audit_logs`

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `actorUserId` | `ObjectId` | autor |
| `action` | `string` | operacao |
| `resourceType` | `string` | tipo de recurso |
| `resourceId` | `ObjectId?` | documento |
| `patientId` | `ObjectId?` | paciente relacionado |
| `occurredAt` | `date` | momento |
| `metadata` | `object?` | contexto adicional |

## 15. Indices MongoDB relevantes

| Colecao | Indice |
| --- | --- |
| `users` | `email` unico |
| `patient_profiles` | `patientId` unico |
| `medications` | `{ patientId, active }` |
| `medications` | `{ patientId, barcode }` |
| `stock_movements` | `{ medicationId, occurredAt }` |
| `stock_movements` | `administrationId` unico quando preenchido |
| `medication_administrations` | `{ scheduleId, scheduledFor }` unico |
| `notification_devices` | `pushToken` unico |

## 16. Limites da versao atual

O frontend deve considerar estes pontos:

1. Login Google ainda nao possui endpoint.
2. A busca por codigo de barras no Cosmos ainda nao possui endpoint.
3. A importacao do CSV ANVISA ainda nao esta implementada.
4. A API registra tokens Expo, mas ainda nao envia push automaticamente.
5. Alarmes locais devem ser agendados no aplicativo Expo.
6. A geracao automatica de ocorrencias futuras ainda precisa de worker agendado.
7. A promocao para `MISSED` ocorre ao consultar o historico; um worker devera
   automatizar isso em producao.
8. Ainda nao existem endpoints para listar usuarios disponiveis ao montar grupos.
9. Ainda nao existem endpoints de edicao ou desativacao de medicamentos e rotinas.
10. Ainda nao existe endpoint para cancelar atendimento.
11. A regra planejada de ocultar nome do paciente por iniciais para cuidadores
    ainda precisa ser aplicada no backend. O frontend nao deve expor o documento
    completo retornado por `/patients/:patientId/profile` para esse perfil.
12. O gerente ainda nao possui endpoint para listar solicitacoes `REQUESTED` sem
    `managerId`. O fluxo de triagem precisa desse endpoint antes de funcionar de
    ponta a ponta.

## 17. Seguranca

- nunca salve `JWT_SECRET`, senha ou tokens externos no repositorio;
- use HTTPS fora do ambiente local;
- armazene o `accessToken` do usuario em armazenamento seguro no aplicativo;
- nao exponha `passwordHash`;
- trate ficha, estoque e historico como dados sensiveis;
- valide a politica LGPD antes da publicacao;
- mantenha backups e logs operacionais por 6 meses, conforme planejamento.
