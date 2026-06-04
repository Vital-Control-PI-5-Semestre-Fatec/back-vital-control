# Vital Control - Planejamento funcional e modelagem MongoDB

## 1. Objetivo

Este documento define as regras de negócio e a estrutura inicial do banco de dados
para a futura API do aplicativo **Vital Control**.

O aplicativo será usado para:

- gerenciar medicamentos e rotinas de medicação de pacientes;
- registrar a execução das rotinas;
- controlar o estoque de medicamentos;
- solicitar e organizar atendimentos domiciliares;
- permitir que cuidadores acompanhem atendimentos atribuídos a eles;
- permitir que gerentes organizem equipes e agendas de cuidadores.

Esta etapa é apenas de planejamento. A implementação da API Node.js não faz parte
deste documento.

## 2. Escopo do MVP

### Incluído no MVP

- cadastro e login com e-mail e senha;
- login com Google;
- cadastro público com escolha do tipo de conta;
- controle de acesso conforme perfil do usuário;
- ficha do paciente;
- cadastro de medicamentos do paciente;
- controle de estoque por movimentações;
- criação de rotinas de medicação;
- registro de medicamento tomado, atrasado, não tomado ou ignorado;
- solicitação de atendimento domiciliar;
- atribuição e acompanhamento do atendimento;
- grupos de cuidado que relacionam paciente, gerente e cuidadores;
- responsável vinculado ao paciente;
- consulta de medicamentos por fontes externas Cosmos e ANVISA;
- notificações push e alarmes para lembrar o horário dos medicamentos;
- trilha de auditoria para operações sensíveis.

### Fora do MVP

- diagnóstico médico;
- prescrição de medicamentos;
- alteração automática da rotina por cuidador ou gerente;
- cobrança e pagamentos;
- telemedicina;
- integração obrigatória com farmácias;
- prontuário clínico completo;
- geolocalização em tempo real do cuidador.

## 3. Perfis de usuário

| Perfil | Descrição |
| --- | --- |
| `PATIENT` | Paciente que gerencia sua ficha, medicamentos, rotinas e solicitações de atendimento. |
| `CAREGIVER` | Cuidador que consulta sua agenda e atualiza atendimentos atribuídos a ele. |
| `CARE_MANAGER` | Gerente que organiza grupos de cuidado, agenda e atribuição de cuidadores. |
| `RESPONSIBLE` | Responsável vinculado a um paciente para auxiliar no acompanhamento. |

### Premissa inicial

Cada conta possui um perfil principal. Caso uma mesma pessoa precise atuar com
mais de um perfil, a decisão deverá ser revisada antes da implementação.

Não haverá um perfil de administrador geral no MVP.

## 4. Regras gerais

### RN-GER-01 - Identificação

- Todo usuário deve estar autenticado para acessar dados do aplicativo.
- O e-mail deve ser único, normalizado em letras minúsculas e sem espaços nas
  extremidades.
- O próprio usuário escolhe seu perfil no cadastro público.
- Contas `CAREGIVER` e `CARE_MANAGER` são liberadas por autenticação com login.
- O login comprova acesso à conta, mas não concede acesso automático a pacientes.
  A autorização depende de vínculo ativo em um grupo de cuidado.
- As referências internas entre documentos devem usar `ObjectId`, nunca e-mail.
- O e-mail pode ser alterado sem quebrar relacionamentos.

### RN-GER-02 - Autenticação

- O usuário pode entrar com e-mail e senha ou com Google.
- Senhas nunca devem ser armazenadas diretamente; somente o hash seguro.
- Uma conta Google deve ser vinculada pelo identificador do provedor, não apenas
  pelo e-mail informado pelo dispositivo.
- Uma conta pode ser suspensa sem que seus dados históricos sejam removidos.

### RN-GER-03 - Autorização

- Um usuário só pode acessar dados permitidos pelo seu perfil e pelos vínculos
  ativos em grupos de cuidado.
- O paciente pode acessar seus próprios dados.
- O cuidador acessa somente os pacientes e atendimentos vinculados ao seu trabalho.
- O gerente acessa somente grupos e atendimentos sob sua gestão.
- O responsável acessa somente pacientes aos quais possui vínculo ativo.
- Cada consulta da futura API deve aplicar autorização no servidor. O aplicativo
  não é responsável por proteger os dados sozinho.

### RN-GER-04 - Exclusão lógica

- Dados com valor histórico não devem ser apagados fisicamente no fluxo normal.
- Medicamentos, rotinas, vínculos e usuários devem ser desativados com `status`,
  `active` ou `deletedAt`.
- Registros de administração, movimentações de estoque e auditoria são imutáveis.

### RN-GER-05 - Datas

- Datas devem ser armazenadas em UTC no MongoDB.
- A API deve considerar o fuso horário do paciente ao gerar horários e alertas.
- Documentos mutáveis devem possuir `createdAt` e `updatedAt`.

## 5. Regras por domínio

## 5.1 Paciente e ficha

### RN-PAC-01

Cada paciente possui no máximo uma ficha ativa.

### RN-PAC-02

Somente o próprio paciente pode alterar sua ficha no MVP. O responsável não pode
editar a ficha.

### RN-PAC-03

A ficha pode conter dados sensíveis de saúde. Toda leitura ou alteração deve ser
auditável.

## 5.2 Medicamentos e estoque

### RN-MED-01

Um medicamento cadastrado representa um item pertencente a um paciente, e não um
catálogo global. Dois pacientes podem cadastrar o mesmo produto separadamente.

### RN-MED-02

O cadastro pode ser manual ou enriquecido por consulta externa usando código de
barras. Dados externos devem ser tratados como sugestão editável.

### RN-MED-03

O saldo de estoque nunca deve ser alterado sem registrar uma movimentação.

### RN-MED-04

Tipos de movimentação:

| Tipo | Efeito | Exemplo |
| --- | --- | --- |
| `INITIAL_BALANCE` | entrada | saldo informado no cadastro |
| `PURCHASE` | entrada | compra ou reposição |
| `MANUAL_ADJUSTMENT_IN` | entrada | correção positiva |
| `ADMINISTRATION` | saída | dose registrada como tomada |
| `MANUAL_ADJUSTMENT_OUT` | saída | correção negativa |
| `DISCARD` | saída | perda ou descarte |

### RN-MED-05

- Quantidades devem ser maiores que zero.
- Quantidades podem possuir frações, como `2.5 ml`.
- O saldo não deve ficar negativo.
- Cada medicamento pode definir um limite de estoque baixo.
- A unidade de estoque deve ser explícita, como `COMPRIMIDO`, `ML`, `GOTA` ou
  `DOSE`.

### RN-MED-06

Desativar um medicamento impede novas rotinas, mas preserva seu histórico.

### RN-MED-07

A integração com Cosmos e ANVISA faz parte do MVP. A busca por código de barras
pode sugerir dados para preenchimento, mas o paciente deve revisar as informações
antes de concluir o cadastro.

## 5.3 Rotinas de medicação

### RN-ROT-01

Uma rotina pertence a um paciente e referencia um medicamento ativo desse mesmo
paciente.

### RN-ROT-02

Uma rotina deve informar:

- medicamento;
- dose a administrar;
- unidade da dose;
- horários;
- regra de recorrência;
- data de início;
- fuso horário;
- situação ativa ou inativa.

### RN-ROT-03

As recorrências inicialmente suportadas serão:

| Tipo | Uso |
| --- | --- |
| `DAILY` | todos os dias |
| `WEEKDAYS` | dias específicos da semana |
| `INTERVAL_DAYS` | a cada N dias |

Casos como "a cada 8 horas" podem ser representados por vários horários diários.
Regras mais complexas ficam fora do MVP.

### RN-ROT-04

Alterações na rotina passam a valer para ocorrências futuras. O histórico já
registrado deve continuar refletindo a instrução válida no momento da execução.

### RN-ROT-05

Uma rotina não prescreve medicamento. Ela apenas organiza uma orientação já
recebida pelo paciente.

## 5.4 Administração e histórico de medicação

### RN-HIS-01

Cada ocorrência esperada de uma rotina deve possuir um registro identificável
por rotina e data/hora prevista.

### RN-HIS-02

Status possíveis:

| Status | Significado |
| --- | --- |
| `PENDING` | ainda pode ser realizada |
| `TAKEN_ON_TIME` | tomada até o horário previsto |
| `TAKEN_LATE` | tomada após o horário previsto e em até 24 horas |
| `MISSED` | não realizada após 24 horas do horário previsto |
| `SKIPPED` | ignorada conscientemente, com justificativa opcional |

### RN-HIS-03

Uma ocorrência concluída não deve ser sobrescrita silenciosamente. Correções
devem registrar quem corrigiu, quando corrigiu e o motivo.

### RN-HIS-04

Ao registrar `TAKEN_ON_TIME` ou `TAKEN_LATE`, deve ser criada uma saída de estoque
do tipo `ADMINISTRATION`. A operação deve ser idempotente para impedir baixa
duplicada.

### RN-HIS-05

O registro deve guardar um resumo do medicamento e da dose usado naquele momento.
Assim, alterações futuras no cadastro não modificam o histórico.

### RN-HIS-06

O paciente e o cuidador vinculado podem registrar a tomada do medicamento. O
cuidador pode fazer esse registro durante um atendimento domiciliar atribuído a
ele. A ação deve registrar o usuário responsável.

## 5.5 Grupos de cuidado

### RN-GRP-01

Um grupo de cuidado relaciona um paciente, um gerente responsável pela operação e
os cuidadores autorizados a atender esse paciente.

### RN-GRP-02

- Um paciente pode participar de mais de um grupo de cuidado ativo.
- Apenas o gerente do grupo pode adicionar ou remover cuidadores.
- Remover um cuidador não apaga atendimentos históricos.
- Apenas vínculos ativos concedem acesso aos dados operacionais do paciente.

### RN-GRP-03

O cuidador não visualiza o nome completo do paciente nem os campos clínicos da
ficha. A identificação exibida deve ser calculada a partir das iniciais do nome,
como `BL`. Durante um atendimento atribuído a ele, o cuidador pode visualizar os
dados operacionais necessários para realizar a visita, como o endereço copiado no
atendimento.

### RN-GRP-04

O perfil `RESPONSIBLE` faz parte do MVP. O vínculo com pacientes é registrado no
grupo de cuidado. O responsável pode acompanhar medicamentos, estoque e
relatórios dos pacientes vinculados. O acesso é somente para leitura.

## 5.6 Atendimentos domiciliares

### RN-ATE-01

O paciente pode solicitar atendimento domiciliar informando motivo, observações,
endereço de atendimento e janela de horário desejada.

### RN-ATE-02

Fluxo de status:

```text
REQUESTED -> TRIAGED -> SCHEDULED -> IN_PROGRESS -> COMPLETED
          \-> CANCELLED
TRIAGED   \-> CANCELLED
SCHEDULED \-> CANCELLED
SCHEDULED \-> NO_SHOW
```

### RN-ATE-03

- O gerente pode analisar, agendar, atribuir cuidador, trocar cuidador e cancelar.
- O cuidador pode consultar atendimentos atribuídos a ele.
- O cuidador pode iniciar, concluir e registrar observações no atendimento.
- O cuidador não pode atribuir o atendimento a outra pessoa.
- O paciente pode cancelar enquanto o atendimento ainda não foi iniciado.

### RN-ATE-04

Toda mudança de status e de cuidador atribuído deve gerar um evento histórico.

### RN-ATE-05

O endereço salvo no atendimento é uma cópia do endereço informado no momento da
solicitação. Alterar o endereço padrão do paciente não altera visitas antigas.

## 5.7 Notificações e alarmes

### RN-NOT-01

O paciente deve receber lembretes nos horários configurados em suas rotinas
ativas de medicação.

### RN-NOT-02

- O aplicativo deve cadastrar o token push de cada dispositivo autorizado.
- Um usuário pode possuir mais de um dispositivo.
- Tokens inválidos ou removidos devem ser desativados.
- O usuário pode configurar suas preferências de lembrete.

### RN-NOT-03

O aplicativo deve configurar alarmes locais no dispositivo para reduzir a
dependência de conexão com a internet. A API também deve registrar e enviar
notificações push como reforço. Alterações de rotina devem atualizar os alarmes
locais na próxima sincronização.

### RN-NOT-04

Falhas de entrega push não alteram a situação da administração. Uma ocorrência
passa para `MISSED` conforme RN-HIS-02, independentemente da confirmação de
entrega do lembrete.

## 6. Estratégia de modelagem MongoDB

### Princípios

- Usar `ObjectId` nas referências internas.
- Incorporar dados pequenos que são lidos junto e possuem o mesmo ciclo de vida.
- Referenciar dados independentes ou que podem crescer sem limite.
- Manter snapshots nos registros históricos.
- Evitar armazenar listas históricas ilimitadas dentro de um único documento.
- Usar nomes de campos em inglês e valores enumerados estáveis na implementação.

### Visão das relações

```text
users
  |-- 1:0..1 --> patient_profiles
  |-- 1:N ----> medications
  |-- 1:N ----> medication_schedules
  |-- 1:N ----> medication_administrations
  |-- N:N ----> care_groups
  |-- 1:N ----> home_visits

medications
  |-- 1:N ----> stock_movements

home_visits
  |-- 1:N ----> home_visit_events

users
  |-- 1:N ----> notification_devices
  |-- 1:N ----> notifications

users and sensitive documents
  |-- 1:N ----> audit_logs
```

## 7. Coleções

Campos comuns como `_id`, `createdAt` e `updatedAt` são omitidos das tabelas
quando não exigem explicação adicional.

## 7.1 `users`

Armazena identidade, autenticação e perfil principal.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `name` | `string` | sim | nome exibido |
| `email` | `string` | sim | normalizado e único |
| `passwordHash` | `string` | condicional | necessário para login local |
| `authProviders` | `array<object>` | sim | provedores vinculados |
| `authProviders[].provider` | `enum` | sim | `LOCAL` ou `GOOGLE` |
| `authProviders[].providerUserId` | `string` | condicional | obrigatório para Google |
| `role` | `enum` | sim | `PATIENT`, `CAREGIVER`, `CARE_MANAGER`, `RESPONSIBLE` |
| `phone` | `string` | não | contato |
| `status` | `enum` | sim | `ACTIVE`, `SUSPENDED`, `INACTIVE` |
| `notificationPreferences.medicationReminders` | `boolean` | sim | padrão `true` |
| `notificationPreferences.pushEnabled` | `boolean` | sim | padrão `true` |
| `lastLoginAt` | `date` | não | auditoria básica |

Índices:

- único em `{ email: 1 }`;
- único parcial em `{ "authProviders.provider": 1, "authProviders.providerUserId": 1 }`
  para identidades externas.

## 7.2 `patient_profiles`

Armazena ficha e dados sensíveis do paciente.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | `ObjectId` | sim | referência única para `users` com perfil `PATIENT` |
| `bloodType` | `enum` | não | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |
| `weightKg` | `number` | não | maior que zero |
| `heightCm` | `number` | não | maior que zero |
| `allergies` | `array<string>` | sim | padrão `[]` |
| `preExistingConditions` | `array<string>` | sim | padrão `[]` |
| `emergencyContacts` | `array<object>` | sim | padrão `[]` |
| `emergencyContacts[].name` | `string` | sim | nome do contato |
| `emergencyContacts[].phone` | `string` | sim | telefone |
| `emergencyContacts[].relationship` | `string` | não | vínculo com paciente |
| `defaultAddress` | `object` | não | endereço padrão para atendimento |
| `defaultAddress.street` | `string` | sim | logradouro |
| `defaultAddress.number` | `string` | sim | número ou `S/N` |
| `defaultAddress.complement` | `string` | não | complemento |
| `defaultAddress.neighborhood` | `string` | sim | bairro |
| `defaultAddress.city` | `string` | sim | cidade |
| `defaultAddress.state` | `string` | sim | UF |
| `defaultAddress.zipCode` | `string` | sim | CEP |
| `timezone` | `string` | sim | exemplo: `America/Sao_Paulo` |

Índice único em `{ patientId: 1 }`.

## 7.3 `medications`

Armazena medicamentos e o saldo atual otimizado para leitura.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | `ObjectId` | sim | dono do medicamento |
| `name` | `string` | sim | nome do medicamento |
| `dosageDescription` | `string` | sim | exemplo: `500 mg` |
| `barcode` | `string` | não | código de barras |
| `brand` | `string` | não | fabricante ou marca |
| `imageUrl` | `string` | não | imagem opcional |
| `notes` | `string` | não | observações livres |
| `registrationSource` | `enum` | sim | `MANUAL`, `COSMOS`, `ANVISA`, `COSMOS_ANVISA` |
| `stock.currentQuantity` | `number` | sim | saldo calculado, nunca negativo |
| `stock.unit` | `enum` | sim | `TABLET`, `ML`, `DROP`, `DOSE`, `CAPSULE`, `OTHER` |
| `stock.lowStockThreshold` | `number` | não | alerta de estoque baixo |
| `active` | `boolean` | sim | padrão `true` |

Índices:

- `{ patientId: 1, active: 1 }`;
- `{ patientId: 1, barcode: 1 }`.

## 7.4 `stock_movements`

Livro imutável de entradas e saídas de estoque.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | `ObjectId` | sim | facilita consultas autorizadas |
| `medicationId` | `ObjectId` | sim | referência para `medications` |
| `type` | `enum` | sim | um dos tipos definidos em RN-MED-04 |
| `direction` | `enum` | sim | `IN` ou `OUT` |
| `quantity` | `number` | sim | maior que zero |
| `stockBefore` | `number` | sim | saldo anterior |
| `stockAfter` | `number` | sim | saldo resultante |
| `administrationId` | `ObjectId` | não | preenchido para baixa automática |
| `reason` | `string` | não | necessário para ajustes e descarte |
| `performedByUserId` | `ObjectId` | sim | responsável pela ação |
| `occurredAt` | `date` | sim | momento da movimentação |

Índices:

- `{ medicationId: 1, occurredAt: -1 }`;
- único parcial em `{ administrationId: 1 }`.

## 7.5 `medication_schedules`

Armazena rotinas de medicação.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | `ObjectId` | sim | dono da rotina |
| `medicationId` | `ObjectId` | sim | medicamento ativo do paciente |
| `title` | `string` | sim | nome amigável da rotina |
| `dose.quantity` | `number` | sim | maior que zero |
| `dose.unit` | `enum` | sim | unidade aplicável |
| `times` | `array<string>` | sim | horários no formato `HH:mm` |
| `recurrence.type` | `enum` | sim | `DAILY`, `WEEKDAYS`, `INTERVAL_DAYS` |
| `recurrence.weekdays` | `array<number>` | condicional | `0` a `6`, se `WEEKDAYS` |
| `recurrence.intervalDays` | `number` | condicional | maior que zero, se `INTERVAL_DAYS` |
| `startDate` | `date` | sim | início da validade |
| `endDate` | `date` | não | fim opcional |
| `timezone` | `string` | sim | fuso do paciente |
| `instructions` | `string` | não | observações |
| `active` | `boolean` | sim | padrão `true` |

Índice em `{ patientId: 1, active: 1 }`.

## 7.6 `medication_administrations`

Armazena ocorrências previstas e histórico de administração.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | `ObjectId` | sim | paciente |
| `scheduleId` | `ObjectId` | sim | rotina de origem |
| `medicationId` | `ObjectId` | sim | medicamento |
| `scheduledFor` | `date` | sim | data e hora previstas em UTC |
| `status` | `enum` | sim | um dos status de RN-HIS-02 |
| `completedAt` | `date` | não | momento real da administração |
| `performedByUserId` | `ObjectId` | não | quem registrou |
| `notes` | `string` | não | justificativa ou observação |
| `medicationSnapshot` | `object` | sim | nome, dose e unidade válidos na ocorrência |
| `corrections` | `array<object>` | sim | trilha de correções, padrão `[]` |
| `corrections[].previousStatus` | `enum` | sim | status anterior |
| `corrections[].newStatus` | `enum` | sim | novo status |
| `corrections[].reason` | `string` | sim | motivo |
| `corrections[].correctedByUserId` | `ObjectId` | sim | responsável |
| `corrections[].correctedAt` | `date` | sim | momento |

Índices:

- único em `{ scheduleId: 1, scheduledFor: 1 }`;
- `{ patientId: 1, scheduledFor: -1 }`;
- `{ patientId: 1, status: 1, scheduledFor: 1 }`.

Observação: para o MVP, esta deve ser uma coleção comum. Uma coleção time series
é interessante para análise futura, mas dificulta atualizações de status e
correções operacionais.

## 7.7 `care_groups`

Armazena os vínculos operacionais de cuidado.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `name` | `string` | sim | nome interno do grupo |
| `patientId` | `ObjectId` | sim | paciente atendido |
| `managerId` | `ObjectId` | sim | usuário `CARE_MANAGER` |
| `caregiverIds` | `array<ObjectId>` | sim | usuários `CAREGIVER`, padrão `[]` |
| `responsibleIds` | `array<ObjectId>` | sim | usuários `RESPONSIBLE`, padrão `[]` |
| `status` | `enum` | sim | `ACTIVE`, `INACTIVE` |

Índices:

- `{ patientId: 1, status: 1 }`;
- `{ managerId: 1, status: 1 }`;
- `{ caregiverIds: 1, status: 1 }`.

## 7.8 `home_visits`

Armazena solicitação, agenda e estado atual do atendimento domiciliar.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | `ObjectId` | sim | solicitante |
| `careGroupId` | `ObjectId` | não | preenchido na triagem |
| `managerId` | `ObjectId` | não | preenchido na triagem |
| `assignedCaregiverId` | `ObjectId` | não | cuidador atual |
| `reason` | `string` | sim | motivo da solicitação |
| `patientNotes` | `string` | não | observações do paciente |
| `caregiverNotes` | `string` | não | observações do cuidador |
| `requestedWindow.start` | `date` | sim | início desejado |
| `requestedWindow.end` | `date` | sim | fim desejado |
| `scheduledWindow.start` | `date` | não | início agendado |
| `scheduledWindow.end` | `date` | não | fim agendado |
| `addressSnapshot` | `object` | sim | cópia do endereço do atendimento |
| `status` | `enum` | sim | status definido em RN-ATE-02 |
| `startedAt` | `date` | não | início real |
| `completedAt` | `date` | não | conclusão real |
| `cancelledAt` | `date` | não | cancelamento |
| `cancellationReason` | `string` | não | obrigatório ao cancelar |

Índices:

- `{ patientId: 1, createdAt: -1 }`;
- `{ managerId: 1, status: 1, "requestedWindow.start": 1 }`;
- `{ assignedCaregiverId: 1, status: 1, "scheduledWindow.start": 1 }`.

## 7.9 `home_visit_events`

Histórico imutável do atendimento domiciliar.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `homeVisitId` | `ObjectId` | sim | atendimento relacionado |
| `type` | `enum` | sim | `CREATED`, `STATUS_CHANGED`, `ASSIGNED`, `REASSIGNED`, `NOTE_ADDED` |
| `performedByUserId` | `ObjectId` | sim | autor da ação |
| `occurredAt` | `date` | sim | momento do evento |
| `details` | `object` | sim | resumo da alteração |

Índice em `{ homeVisitId: 1, occurredAt: 1 }`.

## 7.10 `notification_devices`

Armazena dispositivos autorizados a receber notificações push.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `userId` | `ObjectId` | sim | dono do dispositivo |
| `pushToken` | `string` | sim | token do provedor push |
| `platform` | `enum` | sim | `ANDROID`, `IOS`, `WEB` |
| `deviceName` | `string` | não | identificação amigável |
| `active` | `boolean` | sim | padrão `true` |
| `lastSeenAt` | `date` | sim | última sincronização |

Índices:

- único em `{ pushToken: 1 }`;
- `{ userId: 1, active: 1 }`.

## 7.11 `notifications`

Armazena lembretes e tentativas de entrega push.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `userId` | `ObjectId` | sim | destinatário |
| `patientId` | `ObjectId` | sim | paciente relacionado |
| `administrationId` | `ObjectId` | não | ocorrência relacionada |
| `type` | `enum` | sim | inicialmente `MEDICATION_REMINDER` |
| `title` | `string` | sim | título exibido |
| `body` | `string` | sim | mensagem exibida |
| `scheduledFor` | `date` | sim | momento programado |
| `status` | `enum` | sim | `SCHEDULED`, `SENT`, `FAILED`, `CANCELLED` |
| `sentAt` | `date` | não | momento do envio |
| `attemptCount` | `number` | sim | padrão `0` |
| `lastError` | `string` | não | erro técnico sem dados sensíveis |

Índices:

- `{ status: 1, scheduledFor: 1 }`;
- `{ userId: 1, scheduledFor: -1 }`;
- único parcial em `{ administrationId: 1, type: 1 }`.

## 7.12 `audit_logs`

Trilha de segurança para dados sensíveis.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `actorUserId` | `ObjectId` | sim | quem realizou a ação |
| `action` | `enum` | sim | `READ`, `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `EXPORT` |
| `resourceType` | `string` | sim | coleção ou domínio acessado |
| `resourceId` | `ObjectId` | não | documento afetado |
| `patientId` | `ObjectId` | não | paciente relacionado |
| `occurredAt` | `date` | sim | momento da ação |
| `metadata` | `object` | não | contexto sem expor segredos ou senha |

Índices:

- `{ patientId: 1, occurredAt: -1 }`;
- `{ actorUserId: 1, occurredAt: -1 }`.

## 8. Consistência e transações

Operações que devem usar transação MongoDB:

1. Criar medicamento com saldo inicial:
   criar `medications` e registrar `INITIAL_BALANCE`.
2. Registrar medicamento tomado:
   atualizar `medication_administrations`, baixar saldo em `medications` e criar
   `stock_movements`.
3. Corrigir uma administração que afete estoque:
   registrar correção, compensar movimentação anterior e atualizar saldo.
4. Alterar atendimento:
   atualizar `home_visits` e criar `home_visit_events`.

Também devem existir proteções de idempotência para requisições repetidas pelo
aplicativo em caso de conexão instável.

## 9. Segurança e privacidade

Como o sistema trata dados pessoais e dados de saúde, a implementação deverá
considerar a LGPD desde o início:

- coletar somente os dados necessários;
- restringir acesso por vínculo e perfil;
- usar HTTPS;
- não registrar senha, token ou ficha clínica completa em logs técnicos;
- proteger segredos fora do código-fonte;
- registrar acessos a informações sensíveis;
- definir política de retenção, exportação e exclusão ou anonimização;
- documentar consentimento e base legal com orientação adequada antes da
  publicação;
- usar backup e restauração testados;
- criptografar conexões e avaliar criptografia adicional para dados sensíveis.

### Política inicial proposta de retenção

Não existe um único "padrão do mercado" que defina automaticamente a retenção de
dados de saúde. Eles são dados pessoais sensíveis conforme a LGPD. Para o
planejamento do MVP, adotar esta proposta até validação jurídica:

- manter dados enquanto a conta estiver ativa e forem necessários ao serviço;
- ao encerrar a conta, bloquear o uso operacional e iniciar processo de exclusão
  ou anonimização sem atraso indevido;
- adotar inicialmente 30 dias como meta operacional para concluir esse processo,
  sem tratar esse prazo como exigência definida pela LGPD;
- conservar após o término somente dados amparados por hipótese legal aplicável,
  incluindo as hipóteses do art. 16 da LGPD;
- registrar consentimentos, solicitações de titular e execução da exclusão;
- reter backups e logs operacionais por 6 meses;
- conservar dados sujeitos a obrigação legal pelo prazo aplicável, mesmo quando
  esse prazo superar 6 meses.

Este documento orienta o produto, mas não substitui validação jurídica.

Referências oficiais:

- [Lei nº 13.709/2018 - LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm);
- [Perguntas frequentes sobre eliminação de dados pessoais](https://www.gov.br/dnit/pt-br/acesso-a-informacao/tratamento-de-dados-pessoais/perguntas-frequentes-sobre-a-lgpd-e-atuacao-da-autoridade-nacional-de-protecao-de-dados-anpd/5-direitos-dos-titulares-de-dados/5-6-em-quais-situacoes).

## 10. Módulos previstos para a futura API

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | login local, Google, sessão e recuperação de acesso |
| `users` | identidade, perfil e status |
| `patient-profiles` | ficha e endereço padrão |
| `medications` | cadastro e consulta de medicamento |
| `stock` | entradas, saídas e alertas |
| `medication-schedules` | rotinas |
| `medication-administrations` | ocorrências e histórico |
| `care-groups` | vínculos entre usuários |
| `home-visits` | solicitação, agenda e atendimento |
| `audit` | trilha de ações sensíveis |
| `notifications` | notificações push e alarmes de horário dos medicamentos |

## 11. Decisões registradas

| Tema | Decisão para o MVP |
| --- | --- |
| Perfil `RESPONSIBLE` | incluído |
| Grupos de cuidado | paciente pode participar de mais de um grupo ativo |
| Cadastro | público; usuário escolhe o tipo da própria conta |
| Registro de administração | cuidador vinculado pode registrar durante atendimento |
| Visualização do cuidador | identificação por iniciais, como `BL`, sem nome completo ou campos clínicos da ficha |
| Atraso | tomada após o horário previsto e em até 24 horas |
| Não realizado | ocorrência muda para `MISSED` após 24 horas |
| Estoque | aceita quantidades fracionadas |
| Notificações | push e alarmes de medicamento incluídos |
| Administrador geral | não haverá no MVP |
| Fontes externas | integração com Cosmos e ANVISA mantida |
| Permissões do responsável | leitura de medicamentos, estoque e relatórios dos pacientes vinculados |
| Liberação de cuidador e gerente | autenticação por login; acesso ao paciente exige vínculo ativo |
| Retenção | backups e logs operacionais por 6 meses; obrigações legais seguem o prazo aplicável |

## 12. Pontos de atenção

As decisões funcionais necessárias para iniciar a implementação foram
registradas. Estes pontos devem ser acompanhados durante o desenvolvimento:

1. Login autentica a conta, mas não valida vínculo profissional. A autorização por
   grupo de cuidado deve ser aplicada rigorosamente em cada operação.
2. A política de retenção e as bases legais devem passar por validação jurídica
   antes da publicação.

## 13. Ordem sugerida de implementação futura

1. Fechar regras técnicas de autorização com base nas decisões registradas.
2. Configurar MongoDB, autenticação e `users`.
3. Implementar ficha do paciente.
4. Implementar medicamentos e movimentações de estoque.
5. Implementar rotinas e ocorrências de administração.
6. Implementar grupos de cuidado.
7. Implementar solicitação e agenda de atendimentos.
8. Implementar auditoria e revisão de segurança.
9. Integrar notificações push, alarmes, Cosmos e ANVISA.
10. Criar testes automatizados para regras críticas e permissões.
