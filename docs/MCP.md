# MCP-сервер GymOS

Удалённый MCP-сервер внутри API, чтобы Claude (claude.ai, Desktop, мобильное приложение и голосовой режим) читал тренировки, планировал и правил запланированные и записывал подходы во время тренировки.

- Эндпоинт: `POST /mcp`, Streamable HTTP без сессий, JSON-ответы, `@modelcontextprotocol/sdk` 1.32 (протокол до `2025-11-25`, именно его сейчас поддерживают коннекторы Claude).
- Авторизация: OAuth 2.1. Работают метаданные ресурса (RFC 9728) и сервера авторизации (RFC 8414), PKCE S256, Dynamic Client Registration (RFC 7591), `resource` (RFC 8707) и `iss` (RFC 9207). Вход через Google, пускается только аккаунт из allowlist.
- Скоупы: `gymos.read` и `gymos.write`. На странице согласия можно выдать только чтение.
- Токены: access на 60 минут, refresh на 30 дней с ротацией. В БД хранятся только SHA-256 хеши.
- Все записи идут через `WorkoutsService.saveFull`, `remove` и `BodyweightService`, как у приложения. Каждое изменение пишется в журнал `McpAuditLog`.

## Переменные окружения

| Переменная | Обязательна | Значение |
|---|---|---|
| `MCP_PUBLIC_URL` | да | Публичный origin API без пути: `https://gymos-api.91.98.164.192.nip.io`. Из него строятся issuer и resource `.../mcp`. |
| `MCP_ALLOWED_EMAILS` | да* | Email-адреса аккаунтов GymOS через запятую. |
| `MCP_ALLOWED_USER_IDS` | да* | Или id пользователей GymOS через запятую. |
| `MCP_TIMEZONE` | нет | Часовой пояс для «сегодня», по умолчанию `Europe/Kyiv`. |
| `MCP_REDIRECT_URIS` | нет | Разрешённые redirect URI клиентов. По умолчанию `https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback`. |
| `MCP_ALLOWED_ORIGINS` | нет | Разрешённые `Origin` для `/mcp`, если он вообще прислан. По умолчанию `https://claude.ai,https://claude.com`. |
| `MCP_ALLOW_LOOPBACK` | нет | `true` разрешает redirect и Origin вида `http://127.0.0.1:*` и `http://localhost:*` для MCP Inspector. Только локально. |
| `MCP_DCR` | нет | `false` отключает открытую регистрацию клиентов. |
| `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET` | нет | Фиксированный конфиденциальный клиент для режима без DCR. |
| `MCP_ACCESS_TTL_MIN`, `MCP_REFRESH_TTL_DAYS` | нет | Время жизни токенов, по умолчанию 60 и 30. |

\* Нужна хотя бы одна из двух. Если allowlist пуст или `MCP_PUBLIC_URL` не задан, все MCP-пути отдают 404.

Google OAuth используется существующий: тот же клиент и тот же `/auth/google/callback`, в Google Console ничего добавлять не нужно.

## Деплой

1. В платформе деплоя добавьте `MCP_PUBLIC_URL` и `MCP_ALLOWED_EMAILS` (или `MCP_ALLOWED_USER_IDS`).
2. Влейте изменения в `main`: авто-деплой соберёт и перезапустит API. Миграции не нужны, таблицы `McpClient`, `McpAuthRequest`, `McpToken` и `McpAuditLog` создаются при старте, как остальные таблицы проекта.
3. Проверка без токена:

```powershell
curl.exe -i -X POST https://gymos-api.91.98.164.192.nip.io/mcp
```

Ожидается `401` и заголовок `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp", scope="gymos.read gymos.write"`.

```powershell
curl.exe https://gymos-api.91.98.164.192.nip.io/.well-known/oauth-protected-resource/mcp
```

## Подключение в claude.ai

1. Customize -> Connectors -> Add -> Add custom connector (claude.ai/customize/connectors).
2. Name: `GymOS`, URL: `https://gymos-api.91.98.164.192.nip.io/mcp` (ровно так, без слеша в конце: Claude сверяет его с `resource`).
3. Connect: откроется вход через Google. Выберите аккаунт из allowlist, затем на странице GymOS нажмите «Дозволити читання і запис» или «Лише читання».
4. Коннектор появится в веб-версии, Desktop и мобильном приложении; голосовой режим использует подключённые инструменты.

Режим без открытой регистрации: задайте `MCP_DCR=false`, `MCP_CLIENT_ID` и длинный случайный `MCP_CLIENT_SECRET`, а в Claude при добавлении коннектора откройте Advanced settings и укажите этот client ID и secret. Тогда никто не сможет зарегистрировать своего клиента и прислать вам ссылку на согласие.

## Инструменты

Чтение: `list_workouts`, `get_workout`, `get_exercise_history` (e1RM по Эпли), `search_exercises`, `get_bodyweight`, `list_templates`, `list_changes`.

Запись (только со скоупом `gymos.write`): `create_planned_workout`, `copy_weekday_workout`, `update_planned_workout`, `log_set`, `add_bodyweight`, `delete_planned_workout`.

Правила, которые проверяет сервер:

- Завершённые тренировки и выполненные подходы не меняются.
- `planned` нельзя на прошедшую дату; «сегодня» считается в `MCP_TIMEZONE`.
- Одна тренировка на дату; `replace=true` заменяет только единственную `planned`.
- RPE в запланированных подходах не заполняется, `durationOverride` не трогается.
- Правка существующей тренировки требует `version` (значение `v=` из последнего чтения). Сервер сверяет его с `updatedAt` до миллисекунды и атомарно при записи; если тренировку успели изменить в приложении, ответ `CONFLICT`, а не перезапись.
- `log_set` работает только с активной тренировкой и по умолчанию заполняет следующий невыполненный подход.

## Отзыв доступа

1. Удалите коннектор в Claude. Токены на стороне GymOS при этом не отзываются.
2. Отзовите все MCP-токены одним из способов:
   - с сессией GymOS (токен лежит в приложении в `localStorage` под ключом `gymos-auth-token`):

     ```powershell
     curl.exe -X POST https://gymos-api.91.98.164.192.nip.io/mcp/oauth/revoke-all -H "Authorization: Bearer <токен>"
     ```

   - на сервере, без входа: `npm run mcp:revoke-all`.
3. Мгновенно закрыть доступ: уберите email из `MCP_ALLOWED_EMAILS` и перезапустите API. Allowlist проверяется на каждом запросе.

## Журнал изменений

Каждая запись через MCP (и каждая отклонённая попытка) попадает в таблицу `McpAuditLog`: когда, инструмент, цель, `before` и `after` в JSON, результат. Последние записи можно спросить у Claude через `list_changes`.

## Проверка локально через MCP Inspector

1. Postgres и данные: `docker run -d --name gymos-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`, затем `npm run prisma:push` и `npm run seed`.
2. Один раз войдите в локальное приложение через `http://localhost:3000/auth/google`, чтобы в локальной БД появился ваш аккаунт.
3. Запустите API с `MCP_PUBLIC_URL=http://localhost:3000`, `MCP_ALLOWED_EMAILS=<ваш email>`, `MCP_ALLOW_LOOPBACK=true`.
4. `npx @modelcontextprotocol/inspector` (нужен Node 22.23.4 или новее), Transport `Streamable HTTP`, URL `http://localhost:3000/mcp`, Connect: пройдите OAuth и вызовите инструменты.

## Ограничения

- Если приложение на телефоне висит в фоне со старой копией тренировки и вы потом меняете её там, приложение на ответ 409 может переотправить свою копию поверх правки Claude (`gym-os/lib/realtime.js`, `localIsAhead` сравнивает только количество подходов). Обновите приложение перед правкой тренировки, которую менял Claude.
- e1RM в `get_exercise_history` считается по Эпли, а 1ПМ в приложении это среднее шести формул, поэтому числа немного отличаются.
- Стартовать и завершать тренировку через MCP нельзя: это делается в приложении.
