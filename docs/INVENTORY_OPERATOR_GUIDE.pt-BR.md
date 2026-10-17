# Produção e estoque de unidades prontas

Esta versão registra produtos acabados, em unidades inteiras, em uma única loja. Clientes e catálogo já existem. Vendas, pedidos, pagamentos, caixa, ingredientes e receitas ainda não estão implementados. Não use esta etapa como uma versão completa para operar a loja. Nenhuma contagem real foi carregada automaticamente.

## Antes de registrar

Entre com sua conta individual. Proprietário e gerente podem registrar saldo inicial, compras, ajustes, perdas e consultar conciliação. Produção pode planejar/iniciar/concluir/cancelar produção e registrar perdas somente de lotes originados da produção. Caixa consulta apenas a disponibilidade vendável de produtos ativos, sem custos, lotes detalhados ou ajustes. Custos de compra são restritos ao proprietário/gerente.

Cadastre o produto e confira sua origem no Catálogo: Produzido ou Ambos para produção; Comprado ou Ambos para recebimento de compra. Produto desativado não recebe novas unidades. Não invente validade a partir do texto de conservação. Não coloque dados pessoais desnecessários em observações ou referências de fornecedor.

## Saldo inicial e compras

Em Estoque, use **Registrar saldo inicial** para a contagem física conhecida: escolha produto, quantidade, referência própria do lote, validade ou motivo explícito de validade desconhecida, e motivo da contagem. O sistema registra o instante atual; não existe data retroativa. Lotes vencidos ainda presentes podem ser contados, mas aparecem bloqueados. A referência não pode repetir para o mesmo produto, mesmo mudando maiúsculas/acentos.

Em **Receber produto comprado**, informe as unidades prontas, referência do fornecedor e, se houver, lote do fornecedor e custo unitário em reais. A referência própria continua obrigatória. Confira a confirmação antes de enviar. Isso recebe estoque; não registra pagamento, nota quitada, despesa de caixa nem altera automaticamente o custo estimado do catálogo.

Use entre 1 e 100.000 unidades por envio; somente inteiros. Não repita uma contagem inicial para “corrigir” o saldo. Consulte o histórico e faça o ajuste autorizado correspondente.

## Produção

Em Produção, escolha **Planejar produção**, produto, quantidade planejada, data e observações opcionais. Planejar ou iniciar não cria estoque e não desconta ingredientes. Use **Iniciar** quando começar o trabalho.

Ao **Concluir**, informe quantas unidades ficaram realmente prontas e os dados do lote. Planejar 10 e concluir 8 recebe apenas 8; a diferença de 2 é rendimento não recebido, sem retirar unidades prontas que nunca entraram. Se nenhuma unidade ficou pronta, cancele com o motivo de falha antes de receber unidades. Cancelar um planejamento ou trabalho aberto não movimenta estoque. Consulte **Detalhes** para quantidades, responsável, horários e observações.

Uma conclusão não pode ser apagada ou alterada. Se o produto foi desativado ou passou a ser somente comprado durante o trabalho, a conclusão é bloqueada; peça revisão do catálogo ou cancele explicitamente. Correções posteriores exigem ajuste compensatório pelo proprietário/gerente, mantendo o movimento original.

## Ler os saldos e a validade

- **Físico:** tudo registrado como presente, inclusive vencidos ainda não descartados.
- **Reservado:** alocações pendentes. A base interna existe; pedidos de clientes ainda não estão disponíveis nesta versão.
- **Disponível para venda:** somente unidades elegíveis e não reservadas. A venda em si ainda não existe.
- **Bloqueado/vencido:** físico sem elegibilidade. Pode conter unidades reservadas vencidas; não some estas colunas como se fossem estoques separados.

Um lote com validade informada vale até o fim dessa data em Fortaleza e fica bloqueado no dia seguinte. Ele não desaparece à meia-noite. Sem validade exige motivo explícito e aparece como desconhecida; o sistema inicialmente permite alocação depois dos lotes datados, mas isso não garante segurança do alimento. O proprietário deve validar essa política antes do uso real. A validade não pode ser editada silenciosamente.

Em **Ver lotes**, confira referência, origem, responsável, validade, saldo e histórico. A busca, os filtros e a paginação não alteram os dados. A conciliação compara histórico e projeções e não corrige nada. Ao encontrar divergência, interrompa novas operações do produto e procure manutenção autorizada com o código da mensagem; não tente esconder a diferença digitando um saldo.

## Perdas e ajustes

Abra o lote e use **Registrar perda**. Informe quantidade e motivo: vencimento, dano, falha de produção em unidades já prontas, descarte sem venda ou outro com explicação. Vencimento exige lote vencido; falha de produção exige lote produzido. Unidades reservadas não podem ser destruídas: a reserva deve ser resolvida explicitamente antes. O sistema não libera reservas por conta própria.

Proprietário/gerente usa **Ajuste** para uma diferença positiva ou negativa, nunca para substituir o saldo inteiro. Lote existente exige a versão lida; se outro usuário movimentou o lote, feche, recarregue, confira o histórico e revise a diferença. Ajuste positivo pode identificar um novo lote. Correções de registro, produção ou compra pedem o identificador do movimento original, disponível no histórico em **Ver referência e observação**. O original permanece visível.

## Se a resposta não chegar

Uma mensagem de **resultado ainda não confirmado** não significa que nada foi gravado. Use **Verificar resultado** ou **Repetir mesma solicitação**: a chave original é mantida e não duplica unidades. Não abra outro formulário para enviar a mesma operação como nova. Enquanto houver incerteza, o formulário bloqueia alterações e fechamento para evitar uma duplicação acidental.

As chaves pendentes ficam na memória da página. Se o navegador for fechado/recarregado, consulte o histórico e peça revisão antes de criar nova operação. Trocar de conta não transfere a chave de outra pessoa. Após confirmação, os resultados e movimentos permanecem no banco. Faça manutenção de cópias conforme o procedimento disponível; o histórico não substitui backup e a restauração completa ainda depende da Fase 8.
