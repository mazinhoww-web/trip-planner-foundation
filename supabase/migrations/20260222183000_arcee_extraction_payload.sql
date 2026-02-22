-- Sprint: Extração Arcee Estruturada + Enriquecimento IA

alter table public.documentos
  add column if not exists extracao_tipo text null,
  add column if not exists extracao_confianca int null,
  add column if not exists extracao_scope text null,
  add column if not exists extracao_payload jsonb null,
  add column if not exists origem_importacao text null default 'arquivo',
  add column if not exists importado boolean not null default false;

alter table public.documentos
  drop constraint if exists documentos_extracao_scope_check;

alter table public.documentos
  add constraint documentos_extracao_scope_check
  check (extracao_scope is null or extracao_scope in ('trip_related', 'outside_scope'));

alter table public.voos
  add column if not exists codigo_reserva text null,
  add column if not exists passageiro_hospede text null,
  add column if not exists hora_inicio text null,
  add column if not exists hora_fim text null,
  add column if not exists metodo_pagamento text null,
  add column if not exists pontos_utilizados int null,
  add column if not exists nome_exibicao text null,
  add column if not exists provedor text null;

alter table public.hospedagens
  add column if not exists codigo_reserva text null,
  add column if not exists passageiro_hospede text null,
  add column if not exists hora_inicio text null,
  add column if not exists hora_fim text null,
  add column if not exists metodo_pagamento text null,
  add column if not exists pontos_utilizados int null,
  add column if not exists nome_exibicao text null,
  add column if not exists provedor text null;
