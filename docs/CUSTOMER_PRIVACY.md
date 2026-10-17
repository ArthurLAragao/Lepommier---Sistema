# Política de cadastro, acesso e anonimização

Este documento descreve controles implementados, sem afirmar conformidade jurídica completa. O responsável pela loja ainda precisa aprovar finalidades, prazos de retenção, acesso a arquivos baixados/backups e atendimento de solicitações.

Nome é obrigatório; telefone, e-mail, nascimento, CPF, endereço/referência e notas são opcionais. Não recolha dados sem necessidade. CPF valida apenas formato/verificadores; e-mail/telefone não têm propriedade ou identidade verificadas. Não use observações para dados pessoais sensíveis desnecessários ou para suposto consentimento promocional.

## Acesso e preferências

- OWNER: cadastro completo; CPF mascarado inicialmente na tela, com ação de revelar. O backend entrega o CPF completo somente a este perfil. Pode registrar preferências, importar/exportar e anonimizar.
- MANAGER: nome/telefone e detalhes operacionais e-mail/nascimento/endereço, situação e preferência atual; não acessa CPF/notas privadas/histórico de evidência, nem altera marketing ou usa operações em massa.
- CASHIER: somente clientes ativos, nome/telefone/matrícula/situação; cria/corrige nome/telefone. Sem demais campos pessoais, importação/exportação, desativação ou anonimização.
- PRODUCTION: nenhum diretório ou dado de cliente. O catálogo não expõe custo estimado a caixa/produção.

Busca usa apenas nome/telefone/matrícula permitidos; erros/contagens e revisão de duplicidades não revelam campos privados ocultos. API e transação aplicam as permissões, independentemente de botões escondidos. Não há URL pública de clientes ou arquivos. Administradores do sistema operacional/banco precisam de controles próprios.

Marketing começa Não informado. Aceita/Não aceita exigem registro explícito pelo proprietário, origem, motivo, data e responsável; referência de evidência é opcional, obrigatória para aceite baseado em revisão de registro. “Sem evidência” não permite OPTED_IN. Histórico é separado das notas. Telefone, compra anterior, aniversário ou CSV não significam aceite. Não existe envio de mensagens nesta fase. A tela mostra até os 50 eventos mais recentes; a base preserva a sequência restante.

## Desativação e anonimização

Desativar mantém os dados e retira o cliente da seleção ativa padrão. OWNER/MANAGER podem reativar; isso não altera preferências de marketing.

Anonimizar exige OWNER, motivo selecionado, aviso explícito e digitação da matrícula. Não é uma desativação reversível. A transação:

1. Substitui nome por “Cliente anonimizado”, remove telefone/e-mail/CPF/nascimento/endereço/notas e referências textuais de evidência de todos os eventos de marketing.
2. Define inativo, data de anonimização e marketing Não aceita; registra a transição com responsável, motivo e instante.
3. Preserva ID, matrícula imutável, datas/versão e referências/histórico não identificador. Não existe exclusão destrutiva de cliente.
4. Cancela todos os trabalhos CSV pendentes e descarta suas prévias do servidor, impedindo que uma revisão antiga reintroduza dados. Navegadores consultam o estado periodicamente e ao foco.

O banco impede reverter a data e acrescentar atributos pessoais a um registro anonimizado. Não há botão de desfazer/reinstalar ou recuperação pública. Um eventual novo atendimento deve seguir procedimento revisado, sem reaproveitar o cadastro anonimizado.

## Caminhos de retenção inspecionados

| Local                    | Política implementada / limite                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer                 | Campos identificadores removidos na anonimização; ID/matrícula/status/datas ficam                                                                                                                              |
| MarketingPreferenceEvent | Estado anterior/novo, ator, motivo e fonte permanecem; referências de evidência são limpas para esse cliente                                                                                                   |
| AuditEvent               | Somente campos alterados/códigos/IDs/contagens para dados pessoais; sem snapshots antes/depois, CSV ou CPF. Append-only preservado                                                                             |
| ImportJob                | Sem linhas/PII; hashes de confirmação e resultado com índices/IDs/matrículas. Remoção de fechados após 30 dias em lotes limitados                                                                              |
| Prévia CSV no servidor   | Somente memória, limite de volume, 15 minutos mais até 60 segundos para limpeza; descartada por cancelamento/anonimização/reinício. Sem arquivo bruto temporário                                               |
| Logs técnicos            | Sem corpos de solicitação, dados pessoais, cookies, senhas ou chaves. Códigos e correlação para diagnóstico                                                                                                    |
| Navegador autorizado     | Estado de tela em memória, sem localStorage/sessionStorage de clientes ou tokens. Dados já entregues podem permanecer na tela, memória ou ferramentas do dispositivo; não podem ser recolhidos retroativamente |
| Downloads anteriores     | Arquivos permanecem no dispositivo; anonimização não altera exportações já baixadas                                                                                                                            |
| Backups anteriores       | Podem conter PII antiga; não são reescritos/apagados silenciosamente. Retenção, acesso e restauração são decisões e ferramentas pendentes da Fase 8                                                            |

Diagnósticos do PostgreSQL dependem da configuração do administrador e podem registrar SQL/detalhes de linhas rejeitadas. Trate esses arquivos como restritos e inclua-os na política de retenção; a aplicação não os apaga. Não habilite logs de parâmetros/linhas pessoais em produção. O banco de teste isolado pode registrar somente exemplos sintéticos de rejeição de restrições.

Remover referências identificadoras do banco ativo não é garantia de apagamento forense de memória/disco ou de cópias externas. Matrículas podem permitir associação em documentos externos que a aplicação não controla. A loja deve restringir e revisar tais cópias. Não compartilhe capturas, CSV ou arquivos de teste contendo dados reais; a verificação desta fase usou somente exemplos sintéticos.

## Phase 5 linked history and collection text

Order rows reference Customer, without copying customer name/contact/CPF/address. Lists/detail use necessary live name and permitted order collection fields, never private customer notes or product cost. PRODUCTION receives no order/history API. New selections/confirmation reject inactive/anonymized customers; existing history remains by ID/order number. Anonymization transactionally clears linked pickupPerson, collectionNote and order notes, bumps versions and prevents reintroduction; safe coded events and product/money snapshots remain. No personal-text before/after audit snapshots or idempotency results restore erased data. Previously delivered browser screens/downloads/diagnostic archives/backups remain outside active-row erasure; retention/recovery acceptance is still pending.
