# Acesso local neste computador — Fase 5

Diretório do projeto: `C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier`.

Existem dois ambientes separados. O banco persistente anterior, `le_pommier_manual`, continua com as quatro migrações da Fase 4 e seus dados/credenciais. Um runtime compilado compatível foi preservado em `data/manual-testing/phase4-runtime`. Não execute o novo `npm start` apontando para esse banco e não aplique a quinta migração nele sem revisar e validar uma restauração completa.

A conferência da Fase 5 usa o banco novo e inicialmente vazio `le_pommier_phase5_preview`, sem conta, produto, estoque, sessão de caixa ou venda automática. Os testes automatizados usam outros bancos e outra porta. O estado de execução efetivamente conferido está em PROGRESS.md; estes comandos não garantem que processos continuem ativos após reiniciar o Windows.

## Endereços e primeiro acesso

- Ambiente anterior preservado (Fase 4): **http://127.0.0.1:3333/**. Use suas credenciais existentes. A instalação já foi encerrada; a chave não é uma senha de login.
- Conferência separada da Fase 5: **http://[::1]:3335/**. Os colchetes são necessários. O endereço IPv6 local separa os cookies do ambiente IPv4; cookies não são isolados somente pela porta. Não substitua o endereço por localhost/127.0.0.1: a política de origem/Host é exata.

Na Fase 5 nova, o instalador autorizado abre privadamente o arquivo `C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier\data\phase5-preview\installation-secret`, escolhe nome/usuário/senha e informa a chave mascarada na tela **Preparar o acesso da loja**. O arquivo pode ser aberto pelo Bloco de Notas local; não envie seu conteúdo, capture a tela ou cole em um terminal registrado. A chave nunca é fornecida por uma API pública. Não existem credenciais padrão. Após criar o primeiro proprietário, entre com o usuário/senha escolhidos; a instalação fecha permanentemente.

A chave anterior fica em `data/manual-testing/installation-secret`, sob o diretório absoluto acima. Ela não reabre a instalação nem recupera senha. Recuperação exige o procedimento controlado do guia de acesso/AUTH_SECURITY.md; não altere diretamente hashes nem crie um administrador oculto.

## Iniciar novamente no PowerShell

```powershell
Set-Location 'C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier'
$pommierNode = 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $pommierNode data/manual-testing/manage.mjs start
& $pommierNode data/phase5-preview/manage.mjs start
& $pommierNode data/manual-testing/manage.mjs status
& $pommierNode data/phase5-preview/manage.mjs status
```

O primeiro comando inicia/reutiliza o PostgreSQL persistente e o runtime anterior; o segundo inicia somente a aplicação da Fase 5 usando o PostgreSQL já ativo. Os lançadores privados validam o destino e usam o entrypoint de produção existente, com Node **24.19.0**. Não instalam serviço global nem abrem interface pública. Os processos ficam em segundo plano: **nenhuma janela de terminal precisa permanecer aberta**. O computador deve permanecer ligado e acordado. O arquivo privado de configuração da Fase 5 é `data/phase5-preview/.env`; a configuração anterior continua no `.env` da raiz. Não exiba esses arquivos em relatórios.

## Parar com segurança

Pare primeiro a aplicação de conferência, depois o ambiente anterior e o PostgreSQL compartilhado:

```powershell
Set-Location 'C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier'
$pommierNode = 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $pommierNode data/phase5-preview/manage.mjs stop
& $pommierNode data/manual-testing/manage.mjs stop
```

Para pausar só a aplicação anterior, mantendo os bancos ativos: `& $pommierNode data/manual-testing/manage.mjs stop-app`. Os lançadores solicitam encerramento normal e não matam processos desconhecidos. Se houver falha/tempo excedido, confira o estado antes de repetir; não apague arquivos de controle nem encerre PostgreSQL à força. Para testes automatizados, pause a aplicação em 3333 antes do harness; ele não é um ambiente manual persistente e encerra seu próprio PostgreSQL.

## Persistência e limites de proteção

Os dois bancos persistem no cluster PostgreSQL **17.10**, somente `127.0.0.1:55438`, em `C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier\data\manual-testing\postgres`. Cada aplicação usa banco/usuário dedicados; reiniciar processos não remove registros. A chave/configuração/logs da conferência ficam em `data/phase5-preview`; os anteriores em `data/manual-testing` e `.env`. Diretórios privados têm acesso local restrito e ficam fora do Git. Não apagar esses diretórios para reiniciar.

Não foi executada migração da base anterior. A ferramenta PostgreSQL portátil não inclui pg_dump/pg_restore; comparação de hashes de linhas e cópias JSON não são backup completo nem restauração verificada. Antes de migrar dados importantes é preciso preparar e testar uma recuperação completa com ferramentas compatíveis, em procedimento separado autorizado. Não se instalou ferramenta global de backup. Não use dados reais na conferência. A liberação operacional depende das Fases 6–9.

As aplicações mantêm autenticação, cookies HttpOnly/SameSite, validação exata Origin/Host, CSRF e CSP. HTTP exclusivamente local tem a exceção documentada de cookie Secure; HTTPS/proxy/LAN não foi validado. O PostgreSQL não é publicado na rede. Para os fluxos da Fase 5, consulte SALES_OPERATOR_GUIDE.pt-BR.md e CASH_FOUNDATION.md; o fechamento de caixa não está implementado.
