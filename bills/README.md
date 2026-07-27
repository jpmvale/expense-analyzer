# Faturas em CSV

Coloque aqui os CSVs das faturas quando estiver usando `EXTRACTOR_SOURCE=local`.

O nome do arquivo precisa conter o **mês de referência** no padrão `<ano>-<mês>`:

```
nubank-2024-03.csv
nubank-2024-04.csv
```

Cabeçalho esperado (a coluna `category` é opcional):

```csv
date,category,title,amount
2024-02-15,supermercado,PAO DE ACUCAR,231.45
2024-02-16,transporte,UBER TRIP,23.90
2024-02-17,,UBER TRIP,18.50
```

Quando `category` vem vazia, o extractor infere: primeiro procura o mesmo título
já categorizado em qualquer fatura da execução, depois tenta palavras-chave
(uber/99app → `transporte`) e, por fim, cai em `outros`.

O pagamento da fatura entra como uma linha de categoria `payment` — a API o separa
dos gastos e usa o valor na coluna "Valor pago".

Os `.csv` deste diretório estão no `.gitignore`: são seus dados, não vão pro repositório.
