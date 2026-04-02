# GitLab Issues

Расширение для просмотра задач GitLab в VS Code и Cursor. Отображает дерево групп и пользователей, их открытые issues и комментарии.

## Возможности

- **Обзор групп и пользователей** — иерархия групп GitLab с участниками
- **Открытые задачи пользователя** — список assignee-issues в компактных карточках
- **Раскрытие карточки** — описание и комментарии с датами по клику
- **Избранное** — хранится в настройках `gitlabIssues.favoriteUsers` (глобально); при первом запуске список переносится из старого `.vscode/user-issue-favorites.json`, если он был
- **Ссылка в GitLab** — переход к issue во внешнем браузере
- **Экспорт дэйлика** — блок **Текущие задачи** (в процессе по тем же лейблам, что и Gantt), плюс полный список открытых задач по избранным (до 50 на человека)
- **Профили проекта** — логический проект из нескольких репозиториев GitLab; выбор в статус-баре или командой **GitLab Issues: Select project profile**
- **Обзор проекта** — экспорт Markdown с Mermaid Gantt по задачам с `due_date` и списком задач без срока

## Настройка

URL и токен запрашиваются при первой неудачной авторизации (или вручную — **Ctrl+Shift+P** → «Preferences: Open Settings» → `gitlabIssues.gitlabUrl`).

- **URL GitLab** — адрес инстанса (например, `https://gitlab.com/`)
- **Токен** — Personal Access Token, сохраняется в секретном хранилище
- **`gitlabIssues.favoriteUsers`** — массив `{ "id": "GitLab user id", "label": "Имя" }`; можно редактировать в Settings UI
- **`gitlabIssues.dailyExportFolder`** — папка для файла `YYYY-MM-DD.md` (абсолютный путь или относительно workspace)
- **`gitlabIssues.dailyTemplatePath`** — необязательно: свой шаблон `.md`; плейсхолдеры `{{date}}`, `{{dateLong}}`, `{{dateHuman}}`, `{{currentTasksByUser}}` (в процессе по `ganttLabelsActive`), `{{gitlabIssuesByUser}}`
- **`gitlabIssues.projectProfiles`** — массив профилей: `{ "id", "label", "gitlabProjectRefs": ["group/a", "group/b"] }`
  - Путь репозитория — как в URL проекта без домена: `develop/avtovaz/repo` (**без** ведущего `/`; иначе GitLab API отдаёт 404)
- **`gitlabIssues.activeProjectProfileId`** — текущий профиль (команда **GitLab Issues: Select project profile**)
- **`gitlabIssues.projectExportFolder`** — базовая папка; файл: `{base}/{id профиля}/YYYY-MM-DD.md` (если пусто — используется `dailyExportFolder`)
- **`gitlabIssues.ganttLabelsDone`** — массив имён лейблов для стиля **done** в Gantt; **пустой массив** — значения по умолчанию (`Отработано`, `Отработано: развернуто`, `UnderValidation`)
- **`gitlabIssues.ganttLabelsActive`** — лейблы для **active**; **пустой** — по умолчанию `В процессе`

## Использование

1. Откройте панель **GitLab Issues** в боковой панели
2. В разделе **Users Gitlab** раскройте группы и выберите пользователя
3. Щёлкните по пользователю — откроется список его открытых задач
4. В карточке: **Открыть в GitLab** — открыть во внешнем браузере, клик по блоку — раскрыть описание и комментарии
5. Правый клик по пользователю → **Add to Favorites** — добавить в **Favorites Gitlab**
6. **GitLab Issues: Export daily standup (Markdown)** — на панели **Favorites Gitlab** (иконка в заголовке) или через Command Palette (`GitLab Issues:`); нужны избранные пользователи и настроенная папка экспорта
7. Задайте **projectProfiles** в настройках → **GitLab Issues: Select project profile** (статус-бар или заголовок **Users Gitlab**) → **GitLab Issues: Export project overview** — файл с Gantt и блоком «Без срока»
