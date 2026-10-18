# Acesso local neste computador — Fase 6

Diretório do projeto: C:/Users/Ryzen/Documents/Codex/2026-10-17/si/outputs/le-pommier.

Existem três aplicações e três bancos distintos no **mesmo cluster PostgreSQL 17.10**, somente em 127.0.0.1:55438. Bancos separados não são instalações separadas de PostgreSQL. Os testes automatizados usam outro cluster, na porta 55437; o harness encerra esse cluster de testes e não serve como ambiente manual persistente.

| Aplicação          | Endereço exato         | Banco persistente         | Estado de migração/runtime                                           |
| ------------------ | ---------------------- | ------------------------- | -------------------------------------------------------------------- |
| Fase 4 preservada  | http://127.0.0.1:3333/ | le_pommier_manual         | Quatro migrações, runtime privado data/manual-testing/phase4-runtime |
| Fase 5 preservada  | http://[::1]:3335/     | le_pommier_phase5_preview | Cinco migrações, runtime privado data/phase5-preview/phase5-runtime  |
| Conferência Fase 6 | http://localhost:3336/ | le_pommier_phase6_preview | Sete migrações, build atual, vínculo somente IPv6 loopback ::1       |

O estado efetivamente verificado aparece em PROGRESS.md. Os comandos não garantem processos ativos depois de reiniciar o Windows. Nenhuma aplicação é publicada na rede. Não troque localhost/IPv4/IPv6: Origin e Host são exatos. Cookies não se isolam pela porta; os três nomes de host distintos evitam compartilhar o cookie de autenticação entre estes ambientes.

## Primeiro acesso e chave privada

Nas Fases 4 e 5, use os usuários/senhas já escolhidos. A instalação foi encerrada e não é reaberta. A chave de instalação **não é senha de login**. O runtime compatível da Fase 5 foi preservado antes da nova geração/build; seus dados e credenciais não foram copiados para a Fase 6.

Na Fase 6 inicialmente vazia, abra http://localhost:3336/. O instalador autorizado deve abrir **privadamente no Bloco de Notas** o arquivo:

```text
C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier\data\phase6-preview\installation-secret
```

Informe essa chave mascarada em **Preparar o acesso da loja**, escolha nome, usuário e senha do primeiro proprietário e conclua uma única vez. Nenhuma credencial padrão ou conta automática é criada. A chave não é fornecida por API pública; não envie seu conteúdo, fotografe a tela ou cole-o em terminal registrado. Após a preparação, entre com o usuário/senha escolhidos; a instalação fecha permanentemente.

As chaves antigas permanecem em data/manual-testing/installation-secret e data/phase5-preview/installation-secret. Elas não reabrem a instalação nem recuperam senha. Recuperação exige o procedimento local controlado do guia de acesso/AUTH_SECURITY.md; não modifique hashes nem crie administrador oculto.

## Iniciar no PowerShell

```powershell
Set-Location 'C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier'
$pommierNode = 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $pommierNode data/manual-testing/manage.mjs start
& $pommierNode data/phase5-preview/manage.mjs start
& $pommierNode data/phase6-preview/manage.mjs start
& $pommierNode data/manual-testing/manage.mjs status
& $pommierNode data/phase5-preview/manage.mjs status
& $pommierNode data/phase6-preview/manage.mjs status
```

O primeiro lançador inicia/reutiliza o cluster persistente e a aplicação compatível da Fase 4. Os outros iniciam somente suas aplicações, com bancos dedicados no cluster já ativo. Os lançadores privados usam o entrypoint de produção real e Node **24.19.0**, validam banco/porta/host e não instalam serviço global. Os processos ficam em segundo plano: **nenhuma janela de terminal precisa permanecer aberta**. Mantenha o computador ligado e acordado.

Não execute o novo npm start com o .env da raiz: ele ainda aponta ao banco antigo e deve usar seu runtime congelado. O arquivo privado da Fase 6 é data/phase6-preview/.env; o da Fase 5 é data/phase5-preview/.env. Não mostre arquivos de configuração em relatórios e não troque os destinos de banco.

## Parar com segurança

Para parar somente a Fase 6, mantendo os outros ambientes e o PostgreSQL:

```powershell
Set-Location 'C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier'
$pommierNode = 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $pommierNode data/phase6-preview/manage.mjs stop
```

Para parar tudo, primeiro pare as duas conferências e por último o ambiente anterior e o cluster compartilhado:

```powershell
& $pommierNode data/phase6-preview/manage.mjs stop
& $pommierNode data/phase5-preview/manage.mjs stop
& $pommierNode data/manual-testing/manage.mjs stop
```

O lançador do PostgreSQL recusa encerrá-lo enquanto uma conferência dependente estiver ativa. Não pare o cluster por fora dessa proteção. Para pausar apenas a aplicação em 3333 durante o teste automatizado: & $pommierNode data/manual-testing/manage.mjs stop-app. Depois restaure-a com start. Nenhum lançador mata processo desconhecido; encerramento pendente exige conferir status/log privado, nunca apagar controle ou forçar PostgreSQL.

## Persistência e proteção de dados

Todos os três bancos persistem no diretório físico:

```text
C:\Users\Ryzen\Documents\Codex\2026-10-17\si\outputs\le-pommier\data\manual-testing\postgres
```

Cada aplicação tem banco/usuário/instalação dedicados. Reiniciar não remove registros. Configuração, chave, logs e controle da Fase 6 ficam em data/phase6-preview, com acesso local restrito e fora do Git; os equivalentes anteriores permanecem em seus diretórios. Não apague esses diretórios para reiniciar. A conferência da Fase 6 não contém cópia de clientes nem produtos/estoque/caixa/vendas automáticos. Use somente dados sintéticos até o aceite operacional.

As bases das Fases 4 e 5 **não foram migradas**. A ferramenta portátil não inclui pg_dump/pg_restore e a restauração completa permanece não verificada. Hashes de linhas e cópias JSON não são backup completo. Migrar dados importantes exige procedimento separado de backup e restauração realmente testado; não foi instalada ferramenta global. Não pare o cluster compartilhado para proteger uma aplicação sem considerar as outras.

Autenticação, cookies HttpOnly/SameSite, Origin/Host exatos, CSRF e CSP permanecem ativos. HTTP local tem a exceção documentada de Secure; TLS/proxy/LAN/Docker não foram validados. Para caixa, consulte CASH_OPERATOR_GUIDE.pt-BR.md e CASH_SESSION_POLICY.md; vendas/pedidos permanecem no guia correspondente. Relatórios gerais (Fase 7), backup/instalação (Fase 8) e piloto (Fase 9) continuam pendentes. Este não é um lançamento operacional de loja.
