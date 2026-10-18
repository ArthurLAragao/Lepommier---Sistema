> Atualização da Fase 6: suprimentos, sangrias, despesas, fechamento contado, revisão e estorno vinculado de movimentação estão disponíveis conforme as permissões. Consulte [o guia de caixa](CASH_OPERATOR_GUIDE.pt-BR.md). Os controles de acesso e os fluxos de vendas abaixo continuam válidos, com o caixa descrito no guia atual. Relatórios gerais, contabilidade e conciliação bancária continuam pendentes.

# Vendas e pedidos — guia de conferência da Fase 5

Esta versão permite conferir vendas, pedidos e retiradas locais. Ainda não é uma liberação para operação diária: relatórios completos, restauração e piloto humano estão pendentes. O fechamento contado está disponível no módulo Caixa. Não há integração bancária, envio de WhatsApp, entrega da loja ou documento fiscal. Cadastre somente dados autorizados; os testes automáticos usam dados fictícios isolados.

## Antes de receber pagamentos

O proprietário ou gerente deve abrir explicitamente a sessão em Caixa ou pelo acesso em Vendas/Pedidos, informando o fundo inicial em reais. Nunca existe abertura automática. O operador usa a única sessão ativa da loja; cada recebimento identifica seu responsável. A tela Caixa permite movimentos, conferência, fechamento contado e revisão conforme o perfil. Não simule fechamento alterando o banco.

## Venda de balcão

Em Vendas, abra uma nova venda, pesquise os produtos ou filtre a categoria e adicione unidades inteiras ao carrinho. Confira disponibilidade, quantidade, preço e total. Cliente é opcional no balcão. Somente proprietário/gerente aplica desconto com motivo; não há pagamento parcial, parcelamento, crediário ou divisão entre meios.

Escolha dinheiro, Pix, cartão de débito ou crédito. Em dinheiro, informe o recebido e confira o troco; o valor da venda é o total, não a quantia entregue. Marque a confirmação somente depois de conferir o recebimento real. A confirmação do sistema registra o fato informado pelo funcionário; não cobra cartão nem verifica Pix. Finalizar grava venda, pagamento, reserva e consumo de estoque juntos. O detalhe é um comprovante **não fiscal**.

Se o produto/preço mudar, atualize o catálogo e revise o carrinho antes de tentar novamente. Estoque insuficiente ou outra falha desfaz toda a gravação. Se o cliente já pagou externamente e a gravação falhou, **não cobre novamente**: confira o histórico e peça orientação ao responsável para registrar corretamente ou devolver o valor externamente. Não há conciliação automática com banco/maquininha.

## Pedido recebido por WhatsApp

O funcionário digita o pedido em Pedidos; a aplicação não lê nem envia mensagens. Informe cliente ativo identificado, produtos e uma retirada futura no horário de Fortaleza. O limite inicial é 365 dias; selecione um minuto futuro. Nome de quem retira, referência de terceiro/Uber e observação são opcionais; evite informações pessoais desnecessárias. Não há taxa, motorista ou rastreamento de entrega.

Salve o rascunho, revise e confirme o total. Rascunho não reserva estoque. Confirmar reserva todos os itens em uma transação, com lotes válidos até a data da retirada; falha em um item não deixa os outros reservados. Depois da confirmação, itens/preços/retirada ficam fixos. Para corrigir, cancele e crie outro pedido, tratando a devolução integral se já pago.

Avance para preparação e pronto. O pagamento integral pode ser registrado antes ou no momento da retirada. Entregue somente depois de confirmar pagamento e elegibilidade dos lotes. A entrega consome as reservas uma única vez. Lote vencido ou produto desativado bloqueia a entrega; não há troca silenciosa de lote. Resolva com cancelamento/recriação e devolução quando necessária. Não há retirada parcial ou encomenda sem estoque.

## Cancelamento e devolução integral

Pedido não entregue e não pago pode ser cancelado por operador autorizado com motivo, liberando todas as reservas. Cancelamento de pedido pago exige proprietário, sessão ativa e confirmação de que a devolução externa integral pelo mesmo meio foi realizada. A aplicação registra devolução/cancelamento/liberação juntos, mas não movimenta banco/maquininha.

Uma venda já entregue pode receber devolução integral apenas pelo proprietário, pelo meio original, com motivo e confirmação externa. A entrega permanece no histórico e alimentos não retornam automaticamente ao estoque. Não existem devolução parcial ou substituição silenciosa por dinheiro. Devoluções de pagamentos antigos entram na sessão atual.

## Revisão, falha de resposta e privacidade

Se outra pessoa alterar o registro, recarregue e revise o conflito. Em resposta incerta, mantenha o diálogo aberto e use consulta ou repetição da mesma solicitação; a chave impede duplicidade. Fechar/recarregar a página perde o pedido pendente em memória: confira o histórico antes de iniciar outra operação. Nunca interprete erro de rede como autorização para cobrar/devolver novamente.

Pedidos mostram separadamente entrega e pagamento. No cliente, total de compras entregues considera o total após desconto antes das devoluções; recebimentos e devoluções aparecem separados. Entrada de pedido não é venda entregue e recebimento não é lucro. Clientes inativos/anonimizados não entram em pedidos novos; o histórico antigo permanece. Anonimização limpa também identificação de retirada e observações vinculadas, sem recuperar dados pessoais antigos por cópias do pedido. Exportações/backup e dados já vistos anteriormente exigem política própria.

Caixa não abre sessão nem aprova desconto/devolução; gerente não aprova devolução; produção não acessa pedidos, pagamentos ou clientes. Use Tab/Shift+Tab nos formulários e os botões de cancelar/recarregar nos diálogos. O acesso inicial e a chave privada estão nos guias de acesso e MANUAL_TESTING.pt-BR.md; nunca envie a chave em mensagens ou capturas.
