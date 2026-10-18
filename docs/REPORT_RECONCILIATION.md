# Evidência de conciliação dos relatórios

Os números abaixo são expectativas literais independentes em centavos/unidades, não resultados calculados pelo mesmo helper SQL sob teste. A execução e o resultado final estão em PROGRESS.md. O cenário existe somente em bancos automatizados isolados, em `apps/api/test/report-scenario.ts` e `reports.integration.test.ts`; não representa movimento da loja.

## Cenário e resultados esperados

O cenário atravessa 13–17/10/2026 em America/Fortaleza. Inclui balcão/WhatsApp, retirada futura paga antes, entrega paga antes, pedido não pago, cancelado e rascunho zero; desconto, renomeação/reprecificação/inativação; reembolso no mesmo dia e posterior; quatro meios; troco; suprimento/sangria/despesa; caixa atravessando meia-noite com diferença; produção parcial e plano não concluído; compra pronta, descarte, ajustes, estoque vencido/desconhecido; cadastro anonimizado. As vendas nos instantes 02:59:59Z e 03:00:00Z comprovam a virada de Fortaleza.

| Métrica                              | 14/10 | 15/10 | 14–15/10 |
| ------------------------------------ | ----: | ----: | -------: |
| Entregas                             |     3 |     2 |        5 |
| Bruto entregue                       | 5.000 | 2.500 |    7.500 |
| Desconto entregue                    |   200 |     0 |      200 |
| Líquido entregue antes de reembolsos | 4.800 | 2.500 |    7.300 |
| Pagamentos registrados               | 6.800 | 1.500 |    8.300 |
| Reembolsos registrados               | 2.000 | 1.800 |    3.800 |
| Recebimentos líquidos                | 4.800 |  -300 |    4.500 |
| Produção concluída                   |     8 |     0 |        8 |
| Comprados prontos recebidos          |    20 |     0 |       20 |
| Descarte de produto pronto           |     2 |     0 |        2 |

Há nove pedidos criados e sete confirmados no intervalo. O produto A tem cinco unidades entregues, bruto 5.500, desconto 200, líquido 5.300; B tem uma unidade, bruto/líquido 2.000. O nome/preço atual de A muda sem alterar esses snapshots. O pedido antecipadamente pago e não entregue não entra em vendas entregues.

Físico A no intervalo: inicial 107 + entradas 8 - consumo 5 - descarte 2 + ajustes líquidos 2 = final 110. No snapshot de 17/10 existem 110 físicos e uma reserva; disponibilidade é zero porque A foi inativado. B: 0 + 20 - 1 = 19, uma reserva, 18 disponíveis. Uma venda concorrente adicional no teste posterior muda somente o estado atual e a data própria, preservando o fechamento anterior.

Caixa 1 abre em 13/10 com 10.000, atravessa meia-noite e fecha com esperado 12.000, contado 11.950 e diferença -50. Caixa 2 abre em 15/10 com 5.000 e recebe o reembolso em dinheiro de uma venda anterior: esperado 3.200. O caixa anterior permanece inalterado. Pagamentos Pix/cartões aparecem nos meios, sem aumentar gaveta. Dinheiro entregue/troco não infla o pagamento de 1.800.

## Evidências adicionais

- Filtros, paginação de 20 linhas e totais do filtro inteiro; exportação integral de 1.000 linhas e recusa da linha 1.001 sem truncamento. Esse cenário não é uma avaliação de grande volume de loja.
- Todas as quantias agregadas são strings decimais/SQL numeric/BigInt; nenhum agregado é arredondado por conversão insegura para Number.
- Snapshot do painel durante venda concorrente; leitura de relatório enquanto a trava global de escrita está ocupada; revogação após snapshot impede entrega do CSV.
- Fonte de cada alerta concilia com sua contagem completa. Alteração deliberada somente no banco isolado identifica deriva de projeção de estoque e de snapshot de caixa, separada da diferença operacional; o relatório não repara nada e o teste restaura os dados/guards.
- Exportações/erros/projeções não ressuscitam PII anonimizada. Regras de Origin/Host/CSRF e permissões são verificadas nas novas rotas.
- Upgrade de sete para oito migrações compara fingerprints de 17 tabelas com histórico verdadeiro dos serviços. Não é backup, restauração, benchmark, evidência Docker/TLS/LAN nem teste com dados reais.

A regressão adicional 35 cria somente no banco isolado um trigger de auditoria diferido que aguarda 2,2 segundos durante COMMIT. Antes da correção, o cliente de dois segundos produzia HTTP 500; o teste exige resposta confirmada e exatamente um evento de exportação. O prazo cliente de 25 segundos supera o orçamento transacional preexistente de 20, mantendo 1,5/7/2 segundos dos relatórios e limites de autenticação. O trigger/função de teste são removidos no finally; não são migração nem configuração de produção.
