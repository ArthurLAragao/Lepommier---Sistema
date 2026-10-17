# Formato de clientes CSV e revisão segura

Nenhum arquivo real da loja foi fornecido ou importado. Os testes usam apenas registros sintéticos em bancos isolados. Importar/exportar é uma ação exclusiva de OWNER. Não compartilhe CSV com dados pessoais sem uma finalidade e autorização adequadas.

## Arquivo e mapeamento

Em Clientes → Importar CSV, baixe o modelo vazio. Cabeçalhos do modelo: `name;phone;email;birthday;cpf;address;notes`. A tela permite mapear explicitamente quaisquer cabeçalhos válidos para esses conceitos; os nomes do modelo não obrigam usar inglês na planilha. Escolha cada coluna; somente nome é obrigatório. Uma coluna não pode preencher dois campos. Colunas sem mapeamento são ignoradas. Matrícula é gerada pelo sistema. Preferências de marketing, situação e histórico não são campos importáveis.

- CSV UTF-8 com ou sem BOM. Na planilha, escolha a opção de salvamento CSV UTF-8. UTF-16/Windows-1252 e arquivos Excel `.xlsx/.xls` não são suportados. A leitura recusa bytes inválidos/substituídos; não converte nomes por adivinhação.
- Escolha ponto e vírgula ou vírgula antes de ler; não há detecção silenciosa. Aspas duplas protegem delimitadores e quebras de linha internas; uma aspa dentro do campo vira `""`. Linhas vazias são ignoradas. Quantidade incorreta de colunas e aspas malformadas impedem a leitura.
- Máximo 256 KiB codificados em UTF-8, 100 linhas de dados, 20 colunas, 80 caracteres por cabeçalho e 2.000 por célula. O parser também limita o registro a 8.192 caracteres. JSON HTTP tem teto de 1 MiB. Cabeçalhos vazios, duplicados após normalização, com controles ou prefixo de fórmula são rejeitados.
- Nome: 2–120 caracteres; telefone brasileiro completo com DDD, opcional; e-mail opcional; CPF opcional com verificadores válidos. Endereço/referência: 300; notas: 1.000. Notas não devem conter informações sensíveis desnecessárias.
- Nascimento: data completa `AAAA-MM-DD` ou `DD/MM/AAAA`, entre 1900 e hoje em Fortaleza. `29/02` sem ano é erro, sem ano inventado.

Exemplo **sintético**, sem CPF obrigatório:

```csv
nome;contato;nascimento;observacao
Pessoa Sintética A;(85) 99999-0001;1980-02-29;Registro de teste
"Pessoa Sintética B";;;"Texto com ; e ""aspas"""
```

Mapeie nome→nome, telefone→contato, nascimento→nascimento e observações→observacao. A tabela mostra valores originais mapeados e normalizados, erros por linha e possíveis duplicidades. Texto é exibido como texto, sem execução de HTML/fórmulas.

## Revisão e confirmação

1. Selecione arquivo/delimitador e leia as colunas.
2. Escolha o mapeamento e gere a prévia.
3. Revise todas as linhas. Erros e CPF já existente exigem corrigir o arquivo ou ignorar a linha. Telefone/e-mail/nome podem ser compartilhados: criar separadamente exige selecionar um motivo; nunca há fusão automática.
4. Escolha Criar ou Ignorar por linha e confirme a revisão explícita.
5. Execute e confira criados/ignorados/matrículas. Todas as linhas novas entram ativas com marketing **Não informado (UNKNOWN)**. Não há atualização/substituição de clientes existentes.

CPF duplicado na própria planilha bloqueia a linha posterior, mesmo se a anterior for ignorada. Corrija/reordene o arquivo e gere nova prévia se precisar escolher outra linha. Nome normalizado idêntico é só aviso; nomes parecidos sem igualdade não recebem classificação automática.

A prévia vale 15 minutos. Há no máximo cinco no servidor e duas por proprietário. Cancele uma revisão antiga ou aguarde se atingir o limite. Reiniciar o servidor exige selecionar/revisar novamente. A tela consulta o estado a cada dez segundos e ao voltar ao foco; uma anonimização cancela todas as revisões pendentes. Valores já entregues a um navegador autorizado não podem ser recolhidos retroativamente.

## Integridade e repetição

Confirmação envia somente identificador da revisão, chave temporária mantida na memória da tela e escolhas. O servidor retém a revisão original e revalida duplicidades atuais, versões e autorização dentro da transação. Se os cadastros relacionados mudaram, a revisão é cancelada e nenhuma linha é criada; revise um novo arquivo/prévia. A aplicação não confia em uma declaração do navegador de que linhas estão válidas.

A importação é **atômica**: todas as linhas selecionadas válidas são criadas com auditoria, ou nenhuma. Uma falha não deixa meia importação. Após resultado de rede incerto, a tela preserva exatamente as escolhas e permite repetir a mesma confirmação. O resultado persistido é devolvido sem duplicar clientes. Escolhas diferentes para uma importação já concluída são rejeitadas. Não comece uma nova revisão para resolver uma confirmação incerta sem primeiro consultar/repetir a anterior.

As permissões são conferidas novamente no banco. Revogação anterior à obtenção do bloqueio impede confirmar. Uma importação que já obteve o bloqueio termina antes de uma revogação posterior; não há promessa de desfazer ações já concluídas. Resultado concluído pode ser consultado/repetido com a mesma conta/chave/escolhas por até 30 dias; fechar a tela perde sua chave local. Não há painel de recuperação de trabalhos fechados nesta fase.

## Retenção e exportação

Arquivo bruto, nome do arquivo e linhas nunca vão para arquivos temporários persistentes, logs ou auditoria. Somente valores mapeados da revisão ficam em memória limitada; expiram em 15 minutos e são removidos na próxima limpeza de até 60 segundos, cancelamento, anonimização ou encerramento do processo. Liberação física depende da coleta normal de memória. ImportJob guarda ator, datas, contagens, hashes da chave/escolhas e resultado por índice/matrícula/ID; não guarda PII. Trabalhos fechados há 30 dias são removidos em lotes de até 100 por minuto. A auditoria mantém tipo, ator, contagem e referência do trabalho.

Exportar CSV exige ação/confirmação explícita do proprietário e usa busca/filtro atual (ativos, inativos ou todos), até 5.000 clientes. Cadastros anonimizados são sempre excluídos. Colunas: matrícula, nome, telefone, e-mail, situação, preferência de marketing. **Não** inclui CPF, nascimento, endereço, notas, contas, senhas ou sessões. Arquivo UTF-8 com BOM, ponto e vírgula, CRLF, aspas escapadas e proteção de prefixos de fórmulas. Telefones começando em `+` também recebem apóstrofo de proteção para planilhas.

O download é autenticado, sem URL pública duradoura. A auditoria registra escopo/quantidade, sem linhas nem texto da busca. A exportação é uma extração mínima para revisão, não backup/restore nem formato garantido de reimportação automática: campos neutralizados com apóstrofo precisam ser revisados e preferências exportadas nunca viram aceite de marketing na importação. O arquivo baixado continua no dispositivo sob responsabilidade do operador. Veja CUSTOMER_PRIVACY.md.
