# Guia de clientes e catálogo — Fase 3

Este guia cobre clientes e catálogo. Produção/estoque estão em INVENTORY_OPERATOR_GUIDE.pt-BR.md; vendas, pedidos, pagamento manual e retirada em SALES_OPERATOR_GUIDE.pt-BR.md. **Dívida de cliente e fechamento de caixa não estão implementados.** Consulte a disponibilidade do estoque; o cadastro sozinho não comprova saldo. O perfil agora mostra apenas o histórico realmente registrado de pedidos, entregas, recebimentos e devoluções, separados. Instalação/acesso/recuperação de senha continuam no ACCESS_OPERATOR_GUIDE.pt-BR.md.

## Clientes

Abra Clientes e use **Novo cliente**. Preencha o nome; telefone é opcional. “Mais informações opcionais” reúne os demais campos permitidos ao seu perfil. Informe nascimento somente quando souber a data completa; não invente o ano. Caixa pode criar/corrigir apenas nome/telefone; produção não acessa clientes.

Ao salvar, confira os avisos de nome, telefone ou e-mail semelhante. Contato compartilhado por uma família pode ser legítimo: escolha o motivo para manter pessoas separadas. CPF já vinculado não pode ser duplicado; revise o cadastro existente. Não há fusão/substituição automática. A matrícula aparece após salvar e nunca muda.

Busque por nome (acentos não impedem a busca), telefone ou matrícula. Proprietário/gerente podem alternar ativos/inativos/todos e ordenar; a lista tem páginas de 20. Abra o perfil para detalhes permitidos e datas. O CPF só aparece para proprietário e começa mascarado. Compras/pagamentos mostram que dependem de módulos futuros; nenhum valor fictício é exibido.

**Editar cliente** exige a versão atual. Se outra pessoa alterou antes, a tela informa conflito: feche e revise a versão atual, depois reaplique conscientemente a alteração. Não repita uma edição antiga sem revisar. Uma mudança de situação ou marketing também pode causar conflito de versão.

**Desativar cliente** preserva os dados e exige motivo; pode ser revertido por proprietário/gerente. **Anonimizar cliente** é exclusivo do proprietário, exige matrícula e motivo e remove identificação do banco ativo. Leia o aviso antes de confirmar; não há desfazer. Exportações/backups antigos exigem gestão separada. Detalhes em CUSTOMER_PRIVACY.md.

## Preferência de marketing

O estado inicial é **Não informado**. O proprietário usa **Atualizar preferência**, escolhe estado/origem/motivo e, quando houver, referência mínima da manifestação. Aceite por revisão de registro exige referência; “sem evidência” não permite aceite. Evite copiar dados pessoais desnecessários para a referência. O histórico registra responsável/data/estado. Não há envio promocional/WhatsApp. O cadastro isolado não prova conformidade legal.

## Importar e exportar

Somente o proprietário vê as ações. **Importar CSV** permite baixar o modelo vazio, selecionar CSV UTF-8, escolher delimitador, mapear colunas, revisar valores/erros/duplicidades e decidir Criar/Ignorar por linha. Não importe uma lista real sem autorização e finalidade. A importação não altera cadastros existentes nem opta pessoas em marketing.

Confira a confirmação de revisão antes de executar. Se a rede falhar após confirmar, mantenha a tela e use a repetição das mesmas escolhas: não crie outra importação por impulso. Resultado repete com segurança sem novos registros. Prévias expiram em 15 minutos e são descartadas ao reiniciar ou anonimizar. Erro de revisão antiga exige gerar e revisar outra prévia. Limites/formato e exemplos sintéticos: CUSTOMER_CSV.md.

**Exportar CSV** mostra escopo e colunas antes de baixar. Usa busca/filtro atual, exclui anonimizados e não inclui CPF/notas/endereço/nascimento. Restrinja filtros se exceder 5.000. Guarde o arquivo em local autorizado, sem link público. É extração mínima com proteção de fórmulas, não backup nem reimportação garantida.

## Categorias e produtos

Proprietário/gerente administram em Produtos → Categorias. Crie categoria antes do produto. Nomes de categoria não podem repetir após normalização. Editar/desativar preserva vínculos; desativar categoria **não** desativa seus produtos. Categoria inativa bloqueia novas associações; produtos antigos podem mantê-la.

Em Produtos → **Novo produto**, informe código único, nome, categoria ativa, origem e preço por unidade inteira. O código vira maiúsculo e aceita letras A–Z, números, ponto, hífen e sublinhado, 2–32 caracteres. Preço/custo usam reais na tela e centavos inteiros no banco. Zero exige confirmação explícita; negativo/fração de centavo é erro. Custo estimado é opcional, visível só ao proprietário/gerente e não calcula lucro real. Armazenamento e validade são referências textuais, sem cálculo automático ou garantia de segurança alimentar.

Use busca, filtros de categoria/origem/situação, ordenação e páginas de 20. Abra produto para consultar e editar. Desative marcando a situação no formulário e salvando com o motivo de alteração de preço quando necessário. Caixa/produção consultam apenas catálogo ativo, sem custo ou botões de edição. Não há upload de foto; o marcador neutro é intencional. Quantidades e disponibilidade são consultadas no módulo Estoque, não editadas no catálogo.

Conflito de edição exige recarregar/revisar, como em clientes. Alterações de preço/custo registram responsável/data na auditoria. Itens de pedidos/vendas preservam seus preços e nomes registrados; mudar o catálogo não altera essas cópias históricas. Carrinho ou rascunho com versão antiga exige revisão explícita.

Em erro, anote a mensagem e o identificador de correlação, sem copiar dados pessoais ou senhas. Sessão expirada exige entrar novamente; dados de formulário não são gravados no armazenamento do navegador. Revise o resultado após qualquer interrupção antes de repetir operações.
