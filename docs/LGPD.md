# Privacidade e LGPD — Little Garden ERP

> Documento técnico de apoio. Políticas finais (prazos, bases legais, encarregado/DPO) devem ser validadas pela escola e por assessoria jurídica.

## Princípios aplicados
- Dados de crianças: tratados no melhor interesse da criança (LGPD art. 14); coleta limitada ao necessário.
- Acesso por perfil, aplicado no banco (RLS), não só na interface.
- Nenhum link público para dados de alunos; documentos em bucket privado (acesso por URL assinada, somente Direção/Secretaria).
- Nenhum dado real de crianças em demonstrações ou testes.

## Backup e recuperação
- Ative backups diários no Supabase (plano Pro inclui backups diários; considere PITR para recuperação pontual).
- Complemento: `supabase db dump -f backup.sql` agendado semanalmente e guardado fora do Supabase, com acesso restrito.
- Teste a restauração em um projeto separado ao menos a cada semestre e registre o resultado.

## Retenção (proposta inicial — validar com a escola)
- Dados acadêmicos e documentos escolares: guardar conforme exigências educacionais aplicáveis.
- Dados financeiros e fiscais: guardar pelo prazo legal tributário/contábil.
- Candidatos não matriculados (status “interessado”): definir prazo curto de exclusão ou anonimização.
- Ao fim do prazo: anonimizar ou excluir, registrando em `audit_logs`.

## Direitos dos titulares (procedimentos)
- **Correção:** editar o cadastro (a alteração é registrada em `audit_logs`).
- **Exportação:** na ficha do aluno › Privacidade (LGPD), a Direção/Secretaria exporta todos os dados do aluno em JSON (função `export_student_data`).
- **Eliminação:** preferir arquivamento lógico; eliminação física só pela Direção, após análise de obrigações legais de guarda.

## Consentimentos
Registre na ficha do aluno › Privacidade (LGPD): finalidade, responsável, data e decisão. Guarde também o termo assinado em Documentos.

## Operação
- Revise usuários ativos e perfis periodicamente (tela “Usuários e permissões”).
- Desative imediatamente contas de quem deixa a escola.
- Nunca compartilhe a `service_role key`; ela só existe nos secrets das Edge Functions.
