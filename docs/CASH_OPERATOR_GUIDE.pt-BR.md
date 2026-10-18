# Caixa — guia do operador da Fase 6

O módulo controla dinheiro da gaveta e registra os recebimentos informados pelos funcionários. Não consulta banco/maquininha, executa pagamento/devolução, emite documento fiscal ou substitui contabilidade. Relatórios completos, restauração e piloto humano continuam pendentes. Não use os ambientes de conferência com dados reais.

## Abrir e conferir

Proprietário ou gerente abre **Caixa → Abrir caixa** e informa o fundo inicial realmente contado. Há uma única sessão compartilhada ativa na loja. Ela não abre automaticamente nem fecha à meia-noite. Cada pagamento/movimento identifica seu responsável; fundo inicial não é receita. Operador de caixa registra pagamentos em Vendas/Pedidos, mas não vê o fundo/totais/histórico da loja nem fecha ou corrige o caixa. Produção não acessa informações financeiras.

A sessão mostra abertura, responsável, fundo, pagamentos/devoluções em dinheiro, suprimentos, sangrias, despesas, estornos e **dinheiro físico esperado**. O quadro por meio separa recebimentos brutos, devoluções e líquidos. Pix/débito/crédito não aumentam a gaveta. Em venda em dinheiro, só o total da venda entra no recebido; não some o valor entregue pelo cliente e desconte troco novamente.

## Movimentações

- **Registrar suprimento:** dinheiro realmente colocado na gaveta, com valor positivo e motivo.
- **Registrar sangria:** dinheiro retirado, com motivo. O valor não pode superar o esperado.
- **Registrar despesa:** pequena saída em dinheiro, categoria e motivo; não cria compra, estoque ou conta a pagar.

Não use nomes de destinatários, CPF ou outros dados pessoais nas referências. A referência opcional é um código interno. Não há data retroativa, valor negativo ou edição/exclusão posterior. Um pagamento/devolução não deve ser lançado também como movimento, pois isso conta o mesmo dinheiro duas vezes. Devolução em dinheiro também exige saldo esperado suficiente; suprimento só deve ser informado quando o dinheiro realmente foi colocado.

## Fechar com contagem

1. Use **Atualizar e revisar caixa** e confira os registros.
2. Conte o dinheiro físico sem depender de um total eletrônico.
3. Abra **Fechar caixa**, informe **Valor contado em R$** e revise a diferença.
4. Se houver diferença, informe uma justificativa concreta sem dados pessoais desnecessários.
5. Confirme o fechamento definitivo. Ele não poderá ser reaberto e não encerra seu login.

Diferença = contado menos esperado: negativa significa menos dinheiro contado; positiva, mais. Não significa lucro/prejuízo. Se houve pagamento/devolução/movimento depois da consulta, o servidor rejeita a contagem desatualizada. Cancele o diálogo, recarregue e confira novamente; não sobrescreva uma atividade nova. Uma falha de integridade das fontes é outro problema: uma justificativa de diferença não o resolve e não libera fechamento/revisão.

Pedidos futuros ainda não pagos não impedem fechamento; continuam reservados conforme suas regras e podem receber pagamento numa nova sessão explícita. A sessão pode atravessar dias: confira os instantes reais de abertura/fechamento, sem fechamento automático. Ao abrir a próxima, conte e informe seu fundo; ele não é copiado silenciosamente do caixa anterior.

## Histórico, revisão e correção

Em **Histórico de caixas**, filtre a situação e as datas de abertura em Fortaleza, navegue as páginas ou procure o ID completo. Abra a sessão para ver fontes, contagem, diferença, responsáveis e pagamentos/devoluções vinculados. Devolução de pagamento antigo entra na sessão em que foi registrada e não altera o fechamento anterior. Registro anterior à Fase 6 sem contagem aparece explicitamente indisponível; o programa não inventa fechamento legado.

Somente o proprietário usa **Revisar fechamento**, acrescentando nota e **Aprovado** ou **Requer atenção**. Revisar não altera números, devolve dinheiro ou faz conciliação bancária. Uma nova revisão preserva as anteriores. Se outra revisão ocorrer, recarregue antes de confirmar. Falha de integridade exige investigação técnica; não desative proteções ou altere tabelas para esconder a diferença.

Somente o proprietário pode **Estornar movimentação**. O original permanece e uma compensação integral, única e inversa entra na sessão atual revisada, com motivo e confirmação do movimento físico inverso correspondente. É permitido vincular um movimento de sessão anterior, sem mudar aquele fechamento. Não serve para pagamento/devolução, valor parcial, estorno de estorno ou ajuste livre de saldo. Anotações sem efeito financeiro pertencem à revisão. Outros erros de registro exigem procedimento controlado separado; não invente movimentações físicas.

## Resposta incerta e acesso

Em falha de resposta, mantenha o diálogo e use **Verificar resultado** ou **Repetir mesma solicitação**. A mesma chave evita nova movimentação/fechamento. Escape/fechar fica protegido enquanto o resultado é incerto. Recarregar/sair perde o pedido pendente em memória: confira o histórico antes de iniciar outra operação. Nunca repita um pagamento/devolução externa só por erro de rede; a aplicação registra a confirmação manual e não executa a operação bancária.

Use Tab/Shift+Tab e os botões dos diálogos. Para iniciar/parar os ambientes e obter privadamente a chave inicial, siga MANUAL_TESTING.pt-BR.md. Os bancos das Fases 4 e 5 foram preservados; compartilham o mesmo PostgreSQL com a conferência da Fase 6. Pare todas as aplicações dependentes antes de parar o banco compartilhado. Hashes/cópias JSON não são restauração verificada.
