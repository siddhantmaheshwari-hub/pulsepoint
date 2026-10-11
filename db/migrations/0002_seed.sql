-- Sources
insert into public.sources (id, name, base_url, is_enabled, config) values
  ('hackernews', 'Hacker News', 'https://news.ycombinator.com', true, '{"maxItemsPerKeyword": 25}'),
  ('stackoverflow', 'Stack Overflow', 'https://stackoverflow.com', true, '{"maxItemsPerKeyword": 25}'),
  ('github', 'GitHub Issues', 'https://github.com', false, '{"maxItemsPerKeyword": 20}')
on conflict (id) do nothing;

-- Starter topics & keywords (edit from the Topics screen; no redeploy needed)
insert into public.topics (slug, name, description) values
  ('code-review', 'Code review', 'Review process, reviewer load, review latency, review culture'),
  ('automated-review', 'Automated review & analysis', 'Bots, linters, static analysis, AI reviewers, false positives'),
  ('ci-cd', 'CI/CD automation', 'Pipelines, flaky tests, build times, merge queues'),
  ('dev-workflow', 'Developer workflow', 'Branching, merge conflicts, PR size, developer productivity')
on conflict (slug) do nothing;

insert into public.keywords (topic_id, term)
select t.id, k.term from public.topics t
join (values
  ('code-review','code review'), ('code-review','pull request review'), ('code-review','PR review'),
  ('automated-review','AI code review'), ('automated-review','static analysis'), ('automated-review','false positives'),
  ('ci-cd','flaky tests'), ('ci-cd','CI pipeline'), ('ci-cd','merge queue'), ('ci-cd','build times'),
  ('dev-workflow','merge conflicts'), ('dev-workflow','stacked PRs'), ('dev-workflow','developer productivity')
) as k(slug, term) on k.slug = t.slug
on conflict do nothing;
