# ZapMix WhatsApp Web - Aprovadas separadas da mensagem no ar

Nesta versão, aprovar uma mensagem NÃO coloca no ar.

## Rotas

Use esta rota no GT principal do vMix:

```txt
http://localhost:3000/datasource
```

Ela mostra apenas a mensagem definida pelo botão:

```txt
Colocar no GT
```

Lista completa de mensagens aprovadas:

```txt
http://localhost:3000/datasource/approved
```

Rota alternativa para mensagem atual:

```txt
http://localhost:3000/datasource/current
```

## Como rodar

```bash
npm install
npm start
```

Painel:

```txt
http://localhost:3000
```

## Operação correta

1. Mensagem chega em Pendentes.
2. Clique em Aprovar.
3. Ela vai para Aprovadas, mas NÃO aparece no GT principal.
4. Clique em Colocar no GT para exibir.
5. Para tirar, clique em Tirar do GT.

## vMix

Para o GC principal:

```txt
http://localhost:3000/datasource
```

Para uma lista/tabela de aprovadas:

```txt
http://localhost:3000/datasource/approved
```