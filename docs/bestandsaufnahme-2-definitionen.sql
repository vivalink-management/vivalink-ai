-- Vivalink Management AI: zweite lesende Bestandsaufnahme (nur Programmcode und Regeln, keine Inhalte, keine Änderungen).
-- Zeichenketten mit @ oder über 60 Zeichen werden geleert ('').
select 'funktion' as art, p.proname as name,
       regexp_replace(pg_get_functiondef(p.oid), $re$'([^'@]{0,60})'|'[^']*'$re$, $r$'\1'$r$, 'g') as inhalt
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (p.proname = 'is_admin' or p.proname like 'admin\_%')
  and p.proname !~ '(run_now|reset|ack)'
union all
select 'regel', c.relname || '.' || k.conname,
       regexp_replace(pg_get_constraintdef(k.oid), $re$'([^'@]{0,60})'|'[^']*'$re$, $r$'\1'$r$, 'g')
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and k.contype = 'c'
order by 1, 2;
