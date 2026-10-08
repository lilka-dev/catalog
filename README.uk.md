# Каталог Лілки

[English version / Англійська версія](README.md)

Статичний вебсайт для перегляду застосунків, шпалер та модів для Лілки.

## Можливості

- **Детальні модальні вікна**: натисніть на будь-який елемент, щоб побачити повну інформацію:
  - Опис та історію змін (у форматі markdown)
  - Інформацію про автора
  - Посилання для завантаження виконуваних файлів (застосунки, шпалери) або файлів модів (моди)
  - Посилання на запакований ZIP (`manifest.yml` + entry/mod/додаткові файли)
  - Посилання на репозиторій з вихідним кодом
  - Іконки та скриншоти
- **Локалізація**: контент англійською та українською (`uk`, `en`) з перемикачем
  мови у шапці сайту. Мова за замовчуванням/резервна — українська (`uk`).

## Структура файлів

```
apps/                   # Директорія з застосунками
├── [app-name].app/
│   ├── manifest.yml      # Маніфест застосунку
│   ├── DESCRIPTION.uk.md # Повний опис (українською)
│   ├── DESCRIPTION.en.md # Повний опис (англійською)
│   ├── CHANGELOG.md      # Історія версій
│   ├── icon.png          # Іконка застосунку
│   └── screenshot*.png   # Скриншоти

wallpapers/             # Lua-шпалери/заставки (така ж структура, як у застосунків)
├── [wallpaper-name]/
│   └── manifest.yml

mods/                   # Директорія з модами
├── [mod-name].case/
│   ├── manifest.yml    # Маніфест мода
│   ├── DESCRIPTION.md
│   ├── CHANGELOG.md
│   └── icon.png

site/                   # Вихідні файли статичного сайту
├── index.html          # Головна HTML-сторінка
├── styles.css          # Усі стилі
└── script.js           # Логіка JavaScript-застосунку

build/                  # Генерується build.py
├── index.html          # Скопійовано із site/
├── styles.css          # Скопійовано із site/
├── script.js           # Скопійовано із site/
├── warnings.json       # Попередження збірки
├── apps/
│   ├── index_0.json    # Індекс пагінації застосунків
│   └── [app-name].app/
│       ├── index.json        # Маніфест застосунку
│       ├── index_short.json  # Скорочений маніфест
│       ├── package.zip       # Запаковані файли застосунку + маніфест
│       └── static/           # Завантажені ресурси
│           ├── icon.png
│           ├── screenshot*.png
│           └── execution_file
└── mods/
    ├── index_0.json    # Індекс пагінації модів
    └── [mod-name].case/
        ├── index.json  # Маніфест мода
        ├── package.zip # Запаковані файли мода + маніфест
        └── static/     # Завантажені ресурси

scripts/
├── build.site.sh       # Скрипт для повної збірки
└── generate_test_apps.py  # Генерація тестових даних

.github/workflows/
└── deploy-pages.yml    # Автодеплой через GitHub Actions

build.py                # Головний скрипт збірки
```

## Як додати свій застосунок або мод

Щоб додати свій застосунок або мод до репозиторію Лілки:

### Довідник по `manifest.yml`

Скрипт збірки (`build.py`) перевіряє кожен маніфест. Якщо відсутнє
**обов'язкове** поле, застосунок/мод **пропускається** під час збірки.
Відсутні **необов'язкові** поля лише додають попередження у
`build/warnings.json`.

#### Обов'язкові поля

| Поле | Стосується | Опис |
|------|-----------|------|
| `name` | застосунки та моди | Назва. Простий рядок або локалізована мапа (`uk`/`en`) |
| `keira_version` | застосунки та шпалери | Мінімальна версія прошивки Keira, потрібна застосунку |
| `short_description` | застосунки та моди | Короткий опис. Простий рядок або локалізована мапа |
| `author` | застосунки та моди | Ім'я автора |
| `sources` | застосунки та моди | Репозиторій з вихідним кодом. Має містити `type` та `location.origin` |

```yaml
sources:
  type: git
  location:
    origin: https://github.com/yourusername/yourrepo.git
```

#### Необов'язкові поля

| Поле | Стосується | Опис |
|------|-----------|------|
| `description` | застосунки та моди | Повний опис. Текст, локалізована мапа або посилання на файл `"@DESCRIPTION.md"` |
| `changelog` | застосунки та моди | Історія версій. Текст, локалізована мапа або посилання на файл `"@CHANGELOG.md"` |
| `icon` | застосунки та моди | Файл іконки (локальний шлях або URL). Стискається до макс. 512x512; додатково генерується 64x64 RGB565 `icon_min` для пристрою |
| `screenshots` | застосунки та моди | Список зображень (локальні шляхи або URL). Стискаються до макс. 1920x1080 |
| `entryfile` | застосунки та шпалери | Виконуваний файл застосунку з `type` (`lua`, `archive` або `binary`) та `location.origin`. `executionfile` приймається як застарілий синонім |
| `files` | застосунки та моди | Список додаткових файлів, кожен із `location.origin` |
| `modfiles` | лише моди | Список файлів мода, кожен із `name` та `location.origin` |

**Примітка:** заявлений `entryfile.type` має відповідати розширенню файлу
(`.lua` → `lua`; `.zip`/`.tar`/`.tar.gz`/`.tgz` → `archive`; `.bin` → `binary`),
інакше збірка видасть попередження `type_mismatch`.

### Для застосунків

1. Створіть нову директорію в `apps/` з назвою `yourapp.app`
2. Створіть файл `manifest.yml` з такою структурою:
```yaml
name: Назва вашого застосунку
keira_version: 1.0.0
short_description: Короткий опис
description: "@DESCRIPTION.md"  # Або текст безпосередньо
changelog: "@CHANGELOG.md"      # Або текст безпосередньо
author: Ваше ім'я
icon: icon.png
screenshots:
  - screenshot1.png
  - screenshot2.png
sources:
  type: git
  location:
    origin: https://github.com/yourusername/yourrepo.git
entryfile:
  type: lua  # lua, archive або binary — має відповідати розширенню файлу
  location:
    origin: https://url-to-your-executable-file
```

3. Додайте файли, на які посилається маніфест:
   - `DESCRIPTION.md` — повний опис (якщо використовуєте @DESCRIPTION.md)
   - `CHANGELOG.md` — історія версій (якщо використовуєте @CHANGELOG.md)
   - `icon.png` — іконка застосунку (буде стиснута до 512x512)
   - Скриншоти (будуть стиснуті до макс. 1920x1080)
   
   **Примітка:** якщо у вас є репозиторій, можна посилатися на файли безпосередньо з нього:
   ```yaml
   icon: https://github.com/yourusername/yourrepo/raw/main/icon.png
   screenshots:
     - https://github.com/yourusername/yourrepo/raw/main/screenshot1.png
     - https://github.com/yourusername/yourrepo/raw/main/screenshot2.png
     - ./files/screenshot3.png
   ```

4. Створіть Pull Request

### Для шпалер

Шпалери — це Lua-заставки, анімовані фони та циферблати.

1. Створіть нову директорію в `wallpapers/`
2. Використайте таку ж структуру `manifest.yml`, як для застосунків (`keira_version` обов'язкове),
   з `lua` entryfile:
```yaml
entryfile:
  type: lua
  location:
    origin: https://url-to-your-wallpaper.lua
```

3. Додайте потрібні файли та створіть Pull Request

### Для модів

1. Створіть нову директорію в `mods/` з назвою `yourmod.case`
2. Створіть файл `manifest.yml`, схожий на маніфест застосунку (`keira_version` не потрібен), але використовуйте `modfiles` замість `entryfile`:
```yaml
modfiles:
  - name: Файл 1
    location:
      origin: https://url-to-file1
  - name: Файл 2
    location:
      origin: https://url-to-file2
  - name: Файл 3
    location:
      origin: ./files/path-to-file3
```

3. Додайте потрібні файли (або використовуйте URL із вашого репозиторію) та створіть Pull Request

### Локалізація (англійська та українська)

Каталог підтримує дві мови контенту: українську (`uk`, за замовчуванням/резервна)
та англійську (`en`). Локалізовані поля маніфесту: `name`, `short_description`,
`description` та `changelog`.

Є два способи надати локалізований контент:

1. **Локалізовані markdown-файли** для довгих полів (`description`, `changelog`).
   Вкажіть базовий файл у маніфесті та додайте файли з мовним суфіксом:

   ```yaml
   description: "@DESCRIPTION.md"   # збірка знайде DESCRIPTION.uk.md / DESCRIPTION.en.md
   changelog: "@CHANGELOG.md"       # збірка знайде CHANGELOG.uk.md / CHANGELOG.en.md
   ```

   Потім створіть:
   - `DESCRIPTION.uk.md` — українською
   - `DESCRIPTION.en.md` — англійською

   Якщо існує лише нелокалізований `DESCRIPTION.md`, він використовується як
   контент українською (мовою за замовчуванням), тож наявні одномовні
   застосунки продовжують працювати.

2. **Локалізовані значення безпосередньо в маніфесті** для коротких полів (`name`, `short_description`):

   ```yaml
   name:
     uk: Таймер
     en: Timer
   short_description:
     uk: Простий таймер зворотного відліку зі звуковим сповіщенням
     en: A simple countdown timer with a sound notification
   ```

   Простий рядок також приймається і трактується як мова за замовчуванням:

   ```yaml
   name: Таймер
   ```

Збірка записує об'єкт `localization` та список `languages` у кожен
`index.json` / `index_short.json`. Перемикач мови на сайті використовує ці дані
та відкочується до української (потім до будь-якої доступної мови), якщо
переклад відсутній.

### Валідація

Система збірки автоматично перевіряє ваш внесок:
- **Критичні перевірки** (елемент буде пропущено при невдачі): репозиторій існує, виконувані файли/файли мода доступні
- **Некритичні попередження**: відсутні скриншоти, відсутня іконка (збірка продовжиться з попередженнями)
- Перевірте `build/warnings.json` на наявність проблем після збірки

Запустіть `python build.py --build` локально для перевірки перед надсиланням.

## Як це працює

1. **Індексні файли**: сайт завантажує `apps/index_0.json`, `wallpapers/index_0.json` або `mods/index_0.json` залежно від обраної вкладки
2. **Пагінація**: кожен індексний файл містить:
   - Номер поточної сторінки
   - Загальну кількість сторінок
   - Список назв маніфестів для цієї сторінки
3. **Завантаження маніфестів**: для кожної назви маніфесту сайт завантажує `[type]/[name]/index.json`
4. **Статичні ресурси**: іконки та файли завантажуються з `[type]/[name]/static/`

## Використання

### Локальна розробка

Просто відкрийте `index.html` у браузері. Проте через обмеження CORS вам знадобиться локальний сервер:

```bash
# За допомогою Python 3
cd build
python3 -m http.server 8000
```

Потім відкрийте: `http://localhost:8000`

### Розгортання на GitHub Pages (автоматичне)

Репозиторій містить GitHub Actions workflow, який автоматично збирає та розгортає сайт на GitHub Pages при кожному push у гілку `main`.

**Кроки налаштування:**

1. **Увімкніть GitHub Pages:**
   - Перейдіть у налаштування репозиторію
   - Відкрийте розділ "Pages"
   - У "Build and deployment" встановіть:
     - **Source**: GitHub Actions
   
2. **Зробіть push у гілку main:**
   ```bash
   git add .
   git commit -m "Setup GitHub Pages deployment"
   git push origin main
   ```

3. **Дочекайтеся розгортання:**
   - Перейдіть на вкладку "Actions" у репозиторії
   - Слідкуйте за виконанням workflow "Build and Deploy to GitHub Pages"
   - Після завершення сайт буде доступний за адресою: `https://<username>.github.io/<repository-name>/`

**Що робить workflow:**
- Встановлює Python та залежності (PyYAML, requests)
- Запускає `build.py --build` для генерації JSON-файлів із маніфестів
- Копіює статичні файли сайту (HTML, CSS, JS) у директорію build
- Розгортає директорію `build/` на GitHub Pages

**Ручне розгортання:**
Ви також можете розгорнути сайт вручну, завантаживши директорію `build/` на:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Будь-який вебсервер

## Збірка

Встановіть Python-залежності (Python 3.9+):

```bash
pip install -r requirements.txt
```

Запустіть скрипт збірки для компіляції повного статичного сайту:

```bash
./scripts/build.site.sh
```

Він виконає:
1. Обробку всіх маніфестів у директоріях `apps/`, `wallpapers/` та `mods/` (через `build.py`)
2. Генерацію JSON-індексів із пагінацією
3. Завантаження/копіювання статичних ресурсів (іконки, виконувані файли, файли модів)
4. Копіювання файлів сайту (HTML, CSS, JS) у директорію `build/`
5. Перевірку наявності всіх обов'язкових файлів

### Ручна збірка

Можна також збирати компоненти окремо:

```bash
# Зібрати лише JSON-файли з маніфестів
python3 build.py --build

# Потім вручну скопіювати файли сайту
cp site/{index.html,styles.css,script.js} build/
```

## Структура JSON

### Індексний файл (`index_0.json`)
```json
{
  "page": 0,
  "total_pages": 1,
  "manifests": [
    "app-name",
    "another-app"
  ]
}
```

### Файл маніфесту (`[name]/index.json`)
```json
{
  "name": "App Name",
  "description": "Full description...",
  "short_description": "Brief description",
  "changelog": "Version history...",
  "author": "@username",
  "icon": "icon.png",
  "sources": "{'type': 'git', 'location': {...}}",
  "executionfile": "{'type': 'lua', 'location': 'main.lua'}"
}
```

## Ліцензія

MIT
