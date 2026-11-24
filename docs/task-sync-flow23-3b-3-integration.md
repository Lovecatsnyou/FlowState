# FLOW-23.3b.3 — изолированные интеграционные проверки

Не использовать production, связанный Supabase-проект, реальные токены или данные. Исходные DRAFT защищены и не являются миграциями. Даже успешный PostgreSQL fixture с искусственно включённым readiness не разрешает развёртывание. Тест создаёт роли, таблицы и триггеры и предназначен только для нового временного контейнера.

## PostgreSQL: воспроизведение выполненного теста

Нужны Podman, Python 3, доступ к образу `docker.io/library/postgres:17` и свободное имя контейнера `flowstate-sync-23b3-test`. Команды выполняются из корня репозитория. Контейнер без сети, база только в tmpfs; пароля здесь хватает лишь для запуска образа, сетевые подключения отключены. Не подставлять контейнер с другой базой.

```sh
podman pull docker.io/library/postgres:17
podman run -d --name flowstate-sync-23b3-test --network none --tmpfs /var/lib/postgresql/data:rw,size=256m -e POSTGRES_PASSWORD=flowstate_local_test_only -e POSTGRES_DB=flowstate_sync_test_23b3 docker.io/library/postgres:17
python3 tests/integration/postgres-container.py
podman stop flowstate-sync-23b3-test
podman rm flowstate-sync-23b3-test
```

Дождитесь готовности PostgreSQL перед тестом, если контейнер запускается медленно. Для повторного запуска нужен новый контейнер: тест отказывается работать при существующей схеме `auth`. Он проверяет имя, образ, отключённую сеть, tmpfs и отсутствие портов, затем использует локальный Unix socket внутри контейнера. Он снимает остановки DRAFT и блокировку readiness только в строках/схеме disposable fixture. Исходные SQL-файлы остаются неизменными. Пример использует локальный тестовый пароль; удаление контейнера не должно сопровождаться командами удаления томов.

В fixture Auth представлен синтетическими таблицами и подстановкой `request.jwt.claims`, без подписей JWT. Два независимых процесса psql выполняют транзакции с ограниченными `statement_timeout` и `lock_timeout`; ожидание блокировки проверяется через `pg_stat_activity`. Тест проверяет replay, конфликт, откат, взаимоблокировку с искусственным обратным порядком захвата строк, и оба порядка удаления аккаунта и RPC. Он не доказывает отсутствие всех deadlock, работу Supabase Auth или PostgREST. Расширенные сценарии: [план конкурентных тестов](../supabase/proposals/tests/flow23_3b_2_concurrency.md).

## Отдельный локальный Supabase: проверенный smoke test

Установите Supabase CLI локально в отдельный временный каталог, не глобально; в отдельной пустой директории выполните `supabase init`, затем `supabase start`. Не выполняйте `link`, `db push` или `db reset`. Проверьте `project_id`, конфигурацию портов и что все URL указывают на локальный тестовый стенд. Команды `supabase status` могут выводить локальные ключи — не публикуйте их и не добавляйте в репозиторий. См. [официальное руководство](https://supabase.com/docs/guides/local-development) и [настройку CLI](https://supabase.com/docs/guides/local-development/cli/config).

Воспроизводимый стенд использует уникальный путь `/tmp/flowstate-supabase-23b3`, project ID `flowstate-supabase-23b3` и установленный в `/tmp/flowstate-supabase-cli` CLI. Не применять команды, если такой проект или каталог уже принадлежат другому проекту. Выберите свободные порты и проверьте их до запуска. В использованной версии CLI PostgreSQL слушал `0.0.0.0:54322`; закрытая доверенная тестовая машина или дополнительные ограничения сети обязательны. Не считайте локальные ключи безопасными для публикации.

```sh
mkdir -p /tmp/flowstate-supabase-23b3
npm install --prefix /tmp/flowstate-supabase-cli --no-audit --no-fund supabase
/tmp/flowstate-supabase-cli/node_modules/.bin/supabase init --workdir /tmp/flowstate-supabase-23b3
/tmp/flowstate-supabase-cli/node_modules/.bin/supabase start --workdir /tmp/flowstate-supabase-23b3 --exclude realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
python3 tests/integration/supabase-local-install.py
```

`supabase-local-install.py` отказывается работать при других имени, project ID, пути, образе и при наличии пользователей или задач; он создаёт синтетическую `tasks`, применяет тестовые копии кандидатов и attaches триггеры. Настоящие Auth-таблицы не заменяются заглушками. Readiness сохраняет жёсткое `false`. Скрипт использует роль `supabase_admin` **только в контейнере** для передачи владельца функций; доступность этой роли или эквивалентных прав в облаке не предполагается. Исходные DRAFT не изменяются и не передаются в SQL Editor. Для повтора нужен новый пустой проект; скрипт намеренно не очищает существующую базу. PostgreSQL fixture выше к Supabase неприменим.

После появления и ревью installer отдельно настройте только локальный `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/flow_sync_access_token_hook"
```

После изменения именно этой временной конфигурации остановите только указанный локальный проект и запустите снова той же командой `start`, затем выполните:

```sh
node tests/integration/supabase-auth-local.mjs
```

Этот скрипт получает локальные ключи через CLI, проверяет loopback URL, регистрирует случайного синтетического пользователя, проверяет refresh и подписанные Auth claims, отказ RPC с закрытым readiness, недоступность приватной схемы, logout, удаление пользователя с задачей и очистку связанных записей. Он не выводит токены и ключи. Официальный [контракт hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) включает `session_id`, но один успешный signup и refresh не доказывают порядок commit сессии для всех способов входа.

Создавайте пользователей штатным signup/admin API **только локального стенда**; локальный служебный ключ используйте исключительно из серверного теста и не сохраняйте в проекте. Получите и обновите токен стандартным клиентом; проверяйте оба generation claims и `session_id`, не печатая сам JWT. Затем проверьте истечение, logout/revoke, физическое удаление аккаунта и повторное создание, PostgREST для anon/authenticated и отрицательный доступ к приватным таблицам. Самостоятельно сформированные JWT или установка request GUC не считаются тестом Auth. Тест подмены старого JWT и операции должен использовать фактически выданные локальным Auth токены, а не токены production.

Выявленные отличия локального Supabase 17.11: `auth.users` и `auth.sessions` имеют RLS; `postgres` не superuser и не может передать владение функции роли без права SET ROLE; роли Auth-триггера требуется USAGE на `auth`. Без последнего signup возвращал ошибку базы. Тестовый installer добавляет грант с помощью локального `supabase_admin`; это не утверждает, что подобный механизм доступен или одобрен в облаке. Ветка триггера, где identity уже удалена при каскаде, при RLS на `auth.users` остаётся fail-closed и требует решения и теста с реальным порядком FK.

RPC в исходном состоянии должен отказывать `0A000`: валидная запись в `auth.sessions` не гарантирует соблюдение всех Supabase session-политик. Любой эксперимент с отключением readiness допустим лишь в отдельной одноразовой *тестовой копии* после изоляции и не является проверкой действительности сессии. Для окончательного подтверждения требуется реализовать и отдельно проверить полный механизм сессий. Остановите только этот локальный проект командой `supabase stop --workdir <путь-отдельного-проекта>` после проверки поведения соответствующей версии CLI; не используйте флаги удаления данных и команды сброса или удаления чужих томов.
