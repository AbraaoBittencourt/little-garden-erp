# Little Garden ERP

Sistema de gestão escolar da Escola Little Garden (Lauro de Freitas, BA).
React + TypeScript + Tailwind CSS + Supabase (PostgreSQL, Auth, Storage, RLS).

## Módulos (Etapas 1 a 5)

| Módulo | O que faz |
|---|---|
| Dashboard | Indicadores e 5 gráficos calculados do banco, com filtros (mês, ano, etapa, turma) e alertas |
| Alunos | Cadastro, busca/filtros, arquivamento, importação por CSV com validação prévia, **ficha com abas** (dados, responsáveis, matrícula e histórico de turmas, financeiro, frequência, documentos, pedagógico, observações restritas, LGPD) |
| Responsáveis | Cadastro e vínculos N:N com alunos (financeiro, legal, retirada, emergência); vínculo com login da área dos responsáveis |
| Matrículas | Assistente de 10 etapas, status completos, controle de vagas, lista de espera, bloqueio de duplicidade, geração de mensalidades, contrato e comprovante em PDF |
| Turmas | Turmas, capacidade, professor, alunos da turma, disciplinas por turma |
| Professores e funcionários | Cadastro com filtros por cargo e status; o login do professor limita o acesso às suas turmas |
| Frequência | Registro diário (presente/ausente/justificada + observação), sem duplicidade, relatório por turma/período com alerta de frequência mínima |
| Pedagógico | Avaliações (nota só no Fund. I), relatórios descritivos com modelos, observações sensíveis, planejamento/atividades/reuniões com anexos |
| Financeiro | Painel (previsto, recebido, a receber, a pagar, vencidas, a vencer, descontos, bolsas, multas/juros, fixas × variáveis, fluxo de caixa, resultado), planos, bolsas, categorias, fornecedores |
| Contas a receber | Mensalidades por aluno, pagamento manual (inclusive parcial), histórico, multa/juros, cobrança avulsa, cancelamento, CSV |
| Contas a pagar | Despesas, fornecedor, categoria, centro de custo, comprovante, baixa manual |
| Documentos | Arquivos por aluno/professor/funcionário, validade e alertas, declaração, comprovante, ficha cadastral e contrato a partir de **modelos editáveis** |
| Comunicação | Comunicados (geral, turma, individual), calendário, reuniões; envio por WhatsApp/e-mail **abrindo o canal** (não simula envio) |
| Relatórios | 15 relatórios com filtros e exportação CSV/PDF (nome da escola, data e filtros no arquivo) |
| Área dos responsáveis | Cada responsável vê só os filhos: frequência, cobranças, comunicados (com marcação de leitura) e eventos |
| Usuários, Auditoria, Configurações | Perfis e ativação, trilha de auditoria, dados oficiais, parâmetros, logotipo, etapas, anos letivos |

## O que foi testado (e o que não foi)

**Testado:**
- `tsc` sem erros e `vite build` concluído.
- As 5 migrações aplicadas em PostgreSQL 16 limpo, sem erros, e exercitadas com dados sintéticos: vaga lotada bloqueia a
  confirmação (lista de espera funciona); confirmar matrícula ativa o aluno e registra histórico de turma; mensalidades geradas
  com bolsa e sem duplicar; multa e juros; pagamento atualiza o status; frequência duplicada é rejeitada; nota numérica é barrada
  na Educação Infantil; resumo de frequência com limite por etapa; resumo financeiro; exportação de dados do aluno; permissões por
  perfil (Direção, Financeiro, Professor, Coordenação, usuário inativo) e tentativa de auto-promoção bloqueada.
- Todas as telas abriram em um navegador real (Chromium) sem erros de execução, usando um banco simulado.

**Não testado (depende das suas credenciais ou de uso real):**
- Conexão com um projeto Supabase real: consultas do frontend contra o PostgREST (relações/embeds), Edge Function, upload e download
  de arquivos (logotipo, documentos, comprovantes) e e-mails de convite/recuperação.
- Geração dos PDFs de contrato/declaração com os seus dados oficiais.
- Fluxos de ponta a ponta com perfis reais de professor e responsável.
Siga o roteiro de validação abaixo logo após conectar o banco.

## Roteiro de validação após conectar (30 minutos)
1. Entre como Direção; em **Configurações** preencha razão social, CNPJ e endereço; defina o ano letivo vigente e envie o logotipo.
2. Em **Financeiro › Cadastros** crie um plano e uma bolsa. Em **Turmas** crie uma turma ativa (ex.: Infantil III) com capacidade 2.
3. Em **Matrículas › Nova matrícula** cadastre um aluno **de teste** (nunca dados reais de crianças em testes), confirme e gere as mensalidades.
4. Em **Contas a receber** registre um pagamento parcial e depois o restante; confira o status e o histórico.
5. Em **Frequência** registre presença; em **Relatórios** exporte CSV e PDF.
6. Crie usuários de teste (Professor, Responsável) em **Usuários e permissões**, vincule-os (Professor em Equipe; Responsável em Responsáveis) e confirme que cada um vê só o que deve.
7. Em **Documentos › Modelos** clique em “Criar modelos padrão” e gere um contrato (revise o texto com assessoria jurídica).

## Passo a passo

### 1. Criar o projeto Supabase
1. Crie um projeto em <https://supabase.com>.
2. Em **Authentication > Providers > Email**, mantenha e-mail/senha e **desative “Allow new users to sign up”** (cadastro só por convite da Direção).
3. Em **Authentication > URL Configuration**, defina o *Site URL* (ex.: `http://localhost:5173` e depois o domínio publicado) e adicione `…/redefinir-senha` em *Redirect URLs*.

### 2. Criar o banco
No **SQL Editor**, execute em ordem o conteúdo de:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_seed_and_dashboard.sql`
4. `supabase/migrations/0004_modules.sql`
5. `supabase/migrations/0005_finance_summary.sql`

(ou, com a CLI: `supabase link --project-ref <ref>` e `supabase db push`.)

### 3. Criar a primeira conta da Direção
1. **Authentication > Users > Add user** (e-mail + senha, marque “Auto confirm”).
2. Edite o e-mail em `supabase/bootstrap_first_admin.sql` e execute no SQL Editor.

### 4. Variáveis de ambiente
```
cp .env.example .env.local
```
Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings > API). **Nunca** use a `service_role` no frontend.

### 5. Rodar localmente
```
npm install
npm run dev        # http://localhost:5173
npm run build      # build de produção em dist/
```

### 6. Edge Function de convite de usuários
```
supabase functions deploy admin-create-user
```
A `SUPABASE_SERVICE_ROLE_KEY` já é injetada no ambiente da função. Ela confere se quem chama é da Direção.
Sem essa função, crie usuários em *Authentication > Users* e atribua perfis na tela “Usuários e permissões”.

### 7. Publicar
Vercel/Netlify: comando `npm run build`, pasta `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
`vercel.json` e `public/_redirects` já tratam as rotas do React Router.

### 8. Logotipo
Em **Configurações > Logotipo**, envie o arquivo oficial. Ele é salvo no bucket público `school-assets` com o nome `logo`.
Enquanto não houver logotipo, aparece um espaço reservado.

## Perfis e permissões (aplicadas no banco)

| Dado | Direção | Secretaria | Financeiro | Coordenação | Professor | Responsável |
|---|---|---|---|---|---|---|
| Alunos / matrículas | total | total | leitura | leitura | só da(s) própria(s) turma(s) | só dos filhos |
| Financeiro (cobranças, pagamentos, despesas) | total | leitura de cobranças | total | — | — | cobranças dos filhos (resp. financeiro) |
| Frequência | total | total | — | total | só das próprias turmas | dos filhos |
| Avaliações / relatórios pedagógicos | total | — | — | total | só das próprias turmas; observações sensíveis só autor/coord./direção | — |
| Documentos (tabela e arquivos) | total | total | — | — | — | — |
| Usuários, perfis, auditoria | total | — | — | — | — | — |

Exclusão física é restrita à Direção; prefira o arquivamento (`archived_at`) para preservar o histórico.

## Decisões de modelagem para revisar com a escola

- “Vencido” não é um status gravado: é derivado (cobrança pendente/parcial com vencimento anterior a hoje).
- Cobrança só muda para “pago” por pagamento lançado manualmente; **não há integração bancária nem boleto real** (exige provedor).
- Mensalidades são geradas a partir do mês informado na matrícula, uma por parcela do plano, com desconto da bolsa; a geração não duplica.
- Multa e juros começam em 0%: defina conforme o contrato; a aplicação em cada cobrança vencida é manual e auditada.
- Frequência = presenças ÷ dias registrados (falta justificada não conta como presença). Limites padrão: Ed. Infantil 60% e Fund. 75% (LDB); confirme com a legislação vigente.
- Educação Infantil não aceita nota numérica (regra no banco); o Ensino Fundamental I aceita nota de 0 a 10.
- Documentos obrigatórios da matrícula (certidão, documento do responsável, comprovante de residência, carteira de vacinação) são **sugestões**; ajuste `REQUIRED_DOCS` em `EnrollmentWizard.tsx`.
- O contrato padrão é um ponto de partida: **revise com assessoria jurídica**. Os documentos só são gerados após o cadastro dos dados oficiais da escola.
- Evolução de alunos no dashboard usa a data de ingresso (aproximação). Inadimplência = saldo em atraso ÷ total das cobranças vencidas no mês.
- Excluir um documento remove o registro; o arquivo no storage deve ser limpo periodicamente (rotina de retenção).
- Observações administrativas do aluno ficam em tabela separada (`student_admin_notes`), só Direção/Secretaria. O Financeiro enxerga o cadastro básico do aluno (nome, turma).

## Segurança e LGPD (resumo; ver `docs/LGPD.md`)

Cadastro fechado, usuários nascem inativos, RLS em todas as tabelas, bucket `documents` privado, trilha de auditoria
(`audit_logs`), nenhum dado real de crianças em testes/seed. Backup, retenção e direitos dos titulares estão em `docs/LGPD.md`.

## Estrutura

```
src/            app React (pages, components, contexts, lib)
supabase/
  migrations/   0001 esquema · 0002 RLS/storage · 0003 referências + dashboard · 0004 regras e módulos · 0005 resumo financeiro
  functions/    admin-create-user (Edge Function)
  bootstrap_first_admin.sql
docs/LGPD.md
```
