# Painel e relatórios — guia de operação

Use somente o ambiente de testes indicado em MANUAL_TESTING.pt-BR.md. O sistema ainda depende de restauração verificada, instalação endurecida e piloto humano antes de operação real.

O proprietário abre **Visão geral** para ver entregas, pagamentos, reembolsos e recebimentos líquidos. São grandezas diferentes: um Pix de retirada futura já recebido não significa entrega; um reembolso hoje pode ser de venda antiga. Recebimentos líquidos não são lucro nem confirmação bancária. Clique no cartão para abrir sua fonte filtrada. Alertas de estoque/pedidos/caixa são atuais, mesmo ao consultar um período anterior. Proximidade de validade só aparece quando você escolhe a janela; não há limite inventado de estoque baixo.

Em **Relatórios**, escolha a tabela e o período. **Hoje**, **Ontem**, **Últimos 7 dias** (hoje e seis dias anteriores), **Este mês** e datas personalizadas usam o dia da loja em America/Fortaleza. O navegador em outro fuso não muda a consulta. Não são aceitas datas futuras, impossíveis, invertidas ou mais de 366 dias. Confira a base de data escrita acima da tabela e **Gerado em**. Atualizar consulta novamente as fontes; falha exibe erro/repetição, não um zero de resultado.

Use somente os filtros relevantes exibidos. Produto histórico inativo continua disponível no filtro. As linhas têm ordem estável e páginas de 20; os cartões de totais abrangem **todo o filtro**, não apenas a página. Uma tabela vazia significa ausência no filtro selecionado, não comprovação de ausência em toda a história.

- **Vendas entregues/por produto:** valores históricos e descontos vêm do pedido/item; nomes e categoria atuais estão rotulados. Reembolsos são apresentados separadamente. O preço atual não reescreve vendas antigas.
- **Pagamentos por dia/meio:** bruto, reembolsos e líquido de cada dia/meio. **Ver registros do dia** abre os instantes exatos e seus pedidos. Pix/débito/crédito têm confirmação manual, sem validação por provedor.
- **Entrada e situação:** seleciona criação do pedido e mostra situação atual; não é outra soma de receita. Confirmação e entrega têm datas próprias.
- **Produção/recebimentos/descarte:** produção concluída usa quantidade real, não apenas planejamento. Falta de rendimento é diferente de descarte físico. O custo informado de compra, quando permitido, não é despesa paga nem lucro.
- **Movimentação e conciliação:** físico inicial/final pertence ao período; reservado/disponível é atual. Disponibilidade fica indisponível quando houver falha de integridade. Abra os lotes de origem; não use uma explicação operacional para encobrir divergência de dados.
- **Sessões de caixa:** seleção pela abertura, podendo atravessar dias. Abra **Ver sessão** para as fontes e o fechamento da Fase 6. Dinheiro esperado/contado/diferença não são todos os recebimentos e não são lucro. Pix/cartão e troco não aumentam artificialmente a gaveta.
- **Histórico de um cadastro:** abra Clientes, o perfil e o vínculo do relatório. Mantém um único cadastro, sem exportar diretório, CPF, contato ou notas. O histórico existente no perfil mantém seus próprios totais de vida inteira.

## Exportar com cuidado

Somente OWNER pode exportar. Clique **Exportar CSV**, confira período/filtros/quantidade/escopo, marque a confirmação e baixe. O arquivo usa um novo snapshot e informa o instante de geração; movimento posterior ao relatório pode mudar o número de linhas. Até 1.000 linhas integrais: acima disso a aplicação recusa, sem truncar; reduza filtros/período. Exportar não envia por e-mail nem cria link público.

Formato: UTF-8 com BOM, separador ponto e vírgula, aspas e proteção de fórmulas. Valores monetários estão em **centavos**, indicados no cabeçalho; 1.800 significa R$ 18,00. Instantes são ISO com fuso, datas são AAAA-MM-DD. Não abra o arquivo esperando valores monetários já divididos por cem. Não há dados de autenticação nem campos privados de cliente. Guarde o download em local autorizado; o arquivo local não é apagado por anonimização posterior e exige retenção própria.

MANAGER tem somente as leituras financeiras/operacionais explicitamente concedidas, sem exportação ou dados privados de cadastro. PRODUCTION vê o escopo de estoque/produção permitido, sem finanças/custo/clientes. CASHIER conserva as operações próprias, sem painel financeiro. Solicite ao proprietário a revisão de acesso; manipular URLs não amplia permissões.

Falha/timeout: mantenha os filtros, use **Tentar novamente** ou reduza o período. Não interprete como valor zero. Divergência de integridade exige investigação controlada, sem ajuste genérico ou reparo automático. Este módulo não executa pagamentos/reembolsos, emissão fiscal, campanhas, contabilidade, conciliação bancária ou previsão.
