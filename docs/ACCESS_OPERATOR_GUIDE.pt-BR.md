# Acesso local e administração da equipe

Este guia cobre acesso e contas. Clientes e catálogo têm guia próprio; produção e estoque de unidades prontas estão descritos em INVENTORY_OPERATOR_GUIDE.pt-BR.md. Vendas, pedidos, pagamentos e caixa ainda não estão disponíveis. Não use esta versão como sistema completo de operação da loja.

## Preparar o primeiro acesso

1. O responsável técnico deve usar Node 24, instalar as dependências travadas, configurar o PostgreSQL local e guardar as credenciais do banco em `.env`, fora do Git. O banco deve estar em execução.
2. Se estiver atualizando uma instalação, faça uma cópia verificável do banco pelo procedimento de manutenção existente. A ferramenta automática de backup/restauração ainda depende da Fase 8. Não apague registros, volumes ou migrações.
3. Execute `npm run db:generate`, `npm run db:validate` e `npm run db:migrate`. As quatro migrações são aplicadas na ordem; as migrações anteriores são preservadas.
4. Execute `npm run setup:secret`. O comando cria uma chave aleatória no arquivo privado `data/installation-secret`, sem mostrar seu conteúdo. Um arquivo existente nunca é substituído. Se `INSTALLATION_SECRET_FILE` estiver configurado, esse será o local utilizado.
5. Restrinja o acesso à pasta e ao arquivo à conta do Windows que instala/executa o sistema. O modo de arquivo solicitado pelo programa não substitui as permissões ACL do Windows. Não deixe a chave em pasta compartilhada, controle de versão, capturas de tela, histórico de comandos ou logs.
6. Inicie o aplicativo **depois** de criar a chave. Para desenvolvimento, `npm run dev` e `http://127.0.0.1:5173`. Para conferir os arquivos compilados, `npm run build`, `npm start` e `http://127.0.0.1:3333`.
7. No próprio computador, o instalador autorizado abre o arquivo privado em um editor local e digita a chave no campo oculto “Chave de instalação”. A tela não baixa nem revela essa chave. Não a coloque no endereço do navegador, em armazenamento do navegador ou em mensagens.
8. Escolha nome, usuário e senha do primeiro proprietário. O usuário usa 3 a 32 letras ASCII sem acentos, números, ponto, hífen ou sublinhado; o primeiro caractere deve ser letra ou número. Espaços externos são removidos e letras viram minúsculas. A senha tem 12 a 128 caracteres Unicode, preservando espaços e acentos; use uma senha exclusiva.
9. Confirme uma vez. A tela passa para o login: entre com as credenciais escolhidas. Não existe usuário ou senha padrão.

A criação do proprietário e o fechamento da instalação ocorrem juntos no banco. Duas confirmações concorrentes não criam dois primeiros proprietários. Desativar contas não reabre a instalação. A chave deixa de autorizar qualquer criação depois do fechamento; não existe reinstalação ou reset público. Mantenha o arquivo fora do alcance de outras pessoas e siga a política local de descarte seguro após o fechamento confirmado.

Use o endereço configurado exatamente. `localhost`, `127.0.0.1` e `[::1]` são origens diferentes. O padrão é IPv4; IPv6 exige `HOST=::1` e endereço/origem correspondentes. O primeiro acesso aceita somente conexão direta de `127.0.0.1`, `::1` ou `::ffff:127.0.0.1`. Cabeçalhos de proxy não comprovam presença local. Não configure encaminhamento de portas ou acesso público para esta instalação.

## Entrar, sair e trocar a própria senha

Cada pessoa utiliza uma conta individual. O nome e perfil atuais aparecem no topo. Use “Sair” ao terminar. Um novo login da mesma conta encerra o login anterior; não compartilhe contas entre pessoas.

O acesso dura no máximo 12 horas desde o login, sem extensão por atividade. Não há prazo separado de inatividade. O servidor verifica o prazo em cada operação; a interface também confere ao recuperar o foco e a cada minuto. Quando terminar, entre novamente. Senhas, perfis ou ativação alterados podem exigir novo login imediatamente.

Em **Configurações → Alterar minha senha**, informe a senha atual, a nova senha e sua confirmação. Depois do sucesso, todos os acessos dessa conta terminam, inclusive o atual. Entre com a senha nova.

Após muitas tentativas, aguarde até 10 minutos. A proteção permite até oito tentativas por usuário e sessenta por origem nesse intervalo, incluindo tentativas válidas. Outra proteção pode pedir alguns segundos quando o computador já estiver verificando senhas. Não há bloqueio permanente. Se a conexão cair durante uma alteração, confira o estado antes de repetir; não há repetição automática de alterações.

## Administrar a equipe

Somente **Proprietário(a)** administra contas. Gerente, Caixa e Produção podem alterar a própria senha, mas não podem criar contas, alterar perfis ou consultar a auditoria. Os módulos operacionais continuam indisponíveis para todos.

Em **Configurações → Equipe e acessos**:

- “Adicionar pessoa”: escolha nome, usuário, perfil e senha inicial. Entregue a senha de forma privada e peça que a pessoa a altere. O sistema não envia e-mail ou WhatsApp.
- “Editar”: altere nome e perfil, informando um motivo sem senhas ou dados pessoais desnecessários. O usuário de login não é renomeável. Alterar o perfil encerra os acessos anteriores.
- “Desativar” ou “Reativar”: confira a pessoa e informe o motivo. A desativação encerra acessos e mantém o histórico. Contas não são excluídas pela interface.
- “Redefinir senha”: após confirmar a identidade da pessoa por procedimento local, digite **sua senha de proprietário**, a nova senha e o motivo. Os acessos da pessoa são encerrados. Para sua própria conta, use a troca de senha.

O limite inicial é de cinco contas ativas, incluindo proprietários. Contas desativadas ficam no histórico e na lista paginada. Deve existir ao menos um proprietário ativo; a última conta de proprietário não pode ser desativada ou rebaixada. A regra também é aplicada quando duas pessoas tentam alterar contas ao mesmo tempo.

## Recuperação controlada do proprietário

Se houver outro proprietário acessível, prefira a redefinição pela tela. Se todos os proprietários esqueceram a senha, um responsável técnico autorizado com acesso ao computador e ao banco deve:

1. Confirmar a autorização e a identidade do proprietário fora do aplicativo.
2. Parar todas as instâncias do aplicativo e impedir reinício durante a manutenção. Manter somente o PostgreSQL local em execução. O comando verifica a porta configurada, mas não descobre processos em outras portas.
3. Fazer uma cópia verificável do banco e proteger essa cópia. A restauração automática ainda não está implementada; não improvise comandos de exclusão/reset.
4. Conferir `.env`, `DATABASE_URL`, `HOST` e `PORT` para a instalação correta; o banco deve ser local. Para manutenção, somente a opção de consulta `schema=public` é aceita na conexão; parâmetros que redirecionam host/porta ou outras opções são recusados. No diretório do projeto, executar `npm run auth:recover-owner -- --confirm-local-recovery`.
5. No terminal interativo, informar usuário de um proprietário **já ativo**, motivo e nova senha. A senha não aparece na tela nem deve ser passada em argumento ou variável pública. O comando não cria uma conta, não reativa proprietários e não reabre a instalação.
6. Conferir a mensagem de conclusão, reiniciar o aplicativo e entrar com a nova senha. A recuperação fica registrada como manutenção local, com referência à conta e revogação dos acessos anteriores.

Não altere tabelas manualmente para contornar a proteção do último proprietário. Se o banco tiver sido alterado fora do aplicativo e não existir proprietário ativo, interrompa a operação e obtenha um procedimento técnico específico; esse caso não é resolvido pelo comando atual.

## Problemas comuns

| Mensagem/situação                      | Ação                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Banco/instalação precisa de atenção    | Responsável técnico verifica PostgreSQL, conexão e migrações; depois use “Tentar novamente”.                 |
| Chave não confere                      | Confira o arquivo local correto; nunca peça a chave por uma API pública.                                     |
| Instalação já concluída                | Use o login. Não remova contas para tentar repetir a instalação.                                             |
| Origem não autorizada                  | Abra o endereço local exato configurado, sem alternar entre localhost e IP.                                  |
| Conta alterada por outra pessoa        | Atualize a lista e confira a versão atual antes de editar novamente.                                         |
| Último proprietário / limite de contas | Mantenha um proprietário ativo e respeite cinco contas ativas.                                               |
| Erro inesperado                        | Anote o identificador da solicitação mostrado na mensagem; não envie senha, chave, cookie ou arquivo `.env`. |

Logs de diagnóstico ajudam a localizar falhas. A auditoria de segurança registra ações e referências, com data e identificador da solicitação, sem corpos de formulários ou credenciais. Uma pessoa com acesso administrativo ao Windows ou ao PostgreSQL continua sendo uma pessoa privilegiada; esta versão não protege contra um computador comprometido.
