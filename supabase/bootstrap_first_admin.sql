-- Execute UMA vez, no SQL Editor, depois de criar o primeiro usuário em Authentication > Users.
-- Troque o e-mail abaixo pelo e-mail desse usuário.
update public.profiles set is_active = true, full_name = coalesce(nullif(full_name, ''), 'Direção') where email = 'SEU-EMAIL@exemplo.com';
insert into public.user_roles (user_id, role)
select id, 'direcao' from public.profiles where email = 'SEU-EMAIL@exemplo.com'
on conflict do nothing;
