# Radar Local

Aplicação web local para descobrir e qualificar negócios em Portugal. Permite pesquisar por setor e localização, aplicar filtros, analisar websites públicos, guardar evidências e exportar os resultados para CSV.

Por defeito usa OpenStreetMap/Overpass e não precisa de API key, conta ou alojamento.

## O que já faz

- Pesquisa por Portugal, uma área ou até oito cidades específicas.
- Presets para clínicas dentárias, fisioterapia e clínicas veterinárias, com seleção simultânea de vários setores.
- Pesquisa personalizada para outros setores, tanto no Google como no modo gratuito.
- Filtro por número de avaliações Google.
- Filtros dinâmicos por número de profissionais.
- Validação de negócio operacional e contactos públicos.
- Inferência transparente de receção própria, dono presente e ausência de IT.
- Estados `Qualificado`, `Validar` e `Rejeitado`.
- Potencial SaaS de 0–100 baseado em tração, dimensão, decisor, ausência de IT, operação manual, falta de app/marcação online, lacuna digital e contactos.
- Decomposição visível da pontuação para explicar cada ponto atribuído.
- Evidência, fonte e data por sinal.
- Enriquecimento controlado dos websites públicos.
- Exportação CSV compatível com Excel e CRMs.
- Modo demonstração sem API nem custos.
- Motor gratuito OpenStreetMap/Overpass para pesquisas reais sem chave.
- Seleção manual de negócios para uma campanha de email.
- Recolha de emails empresariais publicados nos websites analisados.
- Mensagens personalizadas com `{{nome}}`, `{{cidade}}` e `{{website}}`.
- Pré-visualização por destinatário, lista “não contactar” e registo local de envios.

## Executar no computador

Requer Node.js 20 ou superior.

### Forma mais simples

Faz duplo clique em **`Iniciar Radar Local.cmd`**. O iniciador instala o que faltar na primeira utilização, arranca o servidor em segundo plano e abre automaticamente o browser.

### Pelo terminal

```powershell
npm install
npm run dev
```

Depois abre [http://localhost:3000](http://localhost:3000).

No Windows, se o PowerShell bloquear `npm.ps1`, usa:

```powershell
npm.cmd install
npm.cmd run dev
```

## Ativar dados reais

### Opção gratuita

Escolhe **Gratuito · OpenStreetMap** dentro da aplicação. Este modo:

- não exige conta nem API key;
- suporta clínicas dentárias, fisioterapia, clínicas veterinárias e pesquisas personalizadas;
- pesquisa uma área ou até três cidades de cada vez;
- permite até seis combinações de setor e localização por pesquisa;
- não fornece classificações nem avaliações Google;
- respeita os limites dos serviços públicos e pode pedir para tentares mais tarde quando estão ocupados.

Mantém a atribuição OpenStreetMap ao usar ou partilhar os dados. Consulta a política do Nominatim: <https://operations.osmfoundation.org/policies/nominatim/>

### Opção Google Places

1. Cria um projeto no Google Cloud.
2. Ativa **Places API (New)** e faturação.
3. Restringe a chave à Places API e, se possível, ao IP onde a app corre.
4. Define quotas baixas e alertas de orçamento.
5. Copia `.env.example` para `.env.local`.
6. Adiciona a chave:

```dotenv
GOOGLE_PLACES_API_KEY=a_tua_chave
```

7. Reinicia a app.

A chave é utilizada apenas pelas rotas de servidor e nunca é enviada ao browser.

## Ativar campanhas de email

O módulo de campanha funciona em modo de preparação sem credenciais: podes selecionar negócios, procurar emails, escrever a mensagem e ver a pré-visualização. Para o envio real, precisas de uma conta de email com acesso SMTP.

1. Copia `.env.example` para `.env.local`.
2. Preenche os dados fornecidos pelo teu serviço de email:

```dotenv
OUTREACH_ENABLED=true
OUTREACH_DAILY_LIMIT=20
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=email@dominio.pt
SMTP_PASS=palavra_passe_ou_app_password
MAIL_FROM="A tua empresa <email@dominio.pt>"
MAIL_REPLY_TO=email@dominio.pt
```

3. Reinicia a app.

A palavra-passe fica apenas em `.env.local`, que está excluído do Git. A app não envia durante pesquisas ou análises: só envia depois de selecionares destinatários, confirmares a base legal e aceitares a confirmação final.

O módulo aceita apenas emails em domínio empresarial, exige uma fonte pública e data de recolha, confirma que o domínio recebe email e acrescenta identificação do remetente e instrução de oposição. Respostas com `REMOVER` devem ser registadas na lista “não contactar” antes de qualquer nova campanha.

## Custos e limites

A app funciona sem alojamento. O motor OpenStreetMap e o modo demonstração são gratuitos. A Google Places API exige uma conta de faturação, mesmo quando o uso fica dentro dos limites gratuitos de cada SKU.

Controlos implementados:

- No máximo três páginas por localização.
- No máximo oito cidades por pesquisa.
- Limite absoluto de doze pedidos por pesquisa.
- O limite Google é repartido automaticamente entre os setores selecionados.
- `FieldMask` limitado aos campos necessários.
- Enriquecimento de, no máximo, vinte websites visíveis de cada vez.

Confirma sempre a tabela oficial de preços antes de usar a chave: <https://developers.google.com/maps/billing-and-pricing/pricing>

## Fiabilidade

### Potencial SaaS

O score de 0–100 não mede apenas se o negócio passa nos filtros. Prioriza empresas onde um fundador tende a conseguir descobrir uma dor e vender uma solução:

- Tração comercial / avaliações: 15 pontos.
- Dimensão da equipa dentro do intervalo: 15 pontos.
- Proprietário ou diretor acessível: 15 pontos.
- Ausência de equipa interna de IT: 10 pontos.
- Operação e receção próprias: 10 pontos.
- Sem app, sem marcação online/portal e contacto manual: 20 pontos.
- Lacuna digital ou website simples: 5 pontos.
- Contactos empresariais públicos: 10 pontos.

`75–100` é prioritário, `55–74` é promissor e `0–54` tem menor prioridade. É um score geral de oportunidade; a dor e o momento de compra devem ser novamente avaliados quando definires o SaaS concreto.

Alguns critérios não existem na Google Places API:

- O número de avaliações e o estado operacional são dados diretos.
- O número de profissionais é estimado a partir das páginas públicas da equipa.
- Receção própria e dono presente são sinais inferidos do website.
- “Sem equipa de IT” nunca é apresentado como certeza apenas pela ausência de referências; fica como provável ou não verificado.

Se desativares “Aceitar evidência provável”, apenas evidência confirmada passa automaticamente. Para prospeção real, confirma por telefone os requisitos operacionais importantes.

## Segurança e utilização responsável

- Não faz scraping do HTML do Google Maps; usa a API oficial.
- Só visita websites públicos das próprias empresas.
- Bloqueia endereços locais e redes privadas para reduzir risco de SSRF.
- Limita páginas, tamanho das respostas e duração dos pedidos.
- Guarda apenas contactos empresariais publicados.
- Exclui do envio automático emails gratuitos/pessoais e contactos sem fonte.
- Limita campanhas a dez destinatários por lote e mantém uma lista local de oposição.
- Não tenta ultrapassar CAPTCHA, login ou proteção anti-bot.

Consulta e respeita os termos das fontes e o RGPD antes de iniciar campanhas de contacto.

## Testes e build

```powershell
npm.cmd test
npm.cmd run build
```

Para executar testes, build e auditoria de dependências numa única verificação:

```powershell
npm.cmd run check
```

O repositório inclui GitHub Actions para repetir automaticamente estas verificações em cada push e pull request para `main`.

## Colocar no GitHub

Não coloques `.env.local` no repositório. O `.gitignore` já exclui ficheiros `.env` privados.

```powershell
git init
git add .
git commit -m "Initial Radar Local MVP"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## Alojamento

Esta versão foi desenhada para correr localmente e não depende do Vercel. O Vercel Hobby restringe o uso a projetos pessoais e não comerciais, por isso não é a opção recomendada para uma ferramenta de prospeção comercial. Para acesso remoto futuro, o backend deve usar uma base de dados Postgres e um worker persistente.
