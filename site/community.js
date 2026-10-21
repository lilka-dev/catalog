// Community features backed by lilka-catalog-api: GitHub sign-in, publishing
// apps, "My apps" and the moderation queue.
//
// The API address comes from <meta name="lilka-api">. When it is empty the
// whole feature stays hidden and the catalog works exactly as before.

const COMMUNITY_STRINGS = {
  uk: {
    'tab-share': 'Опублікувати',
    'tab-my': 'Мої додатки',
    'tab-mod': 'Модерація',
    'sign-in': 'Увійти через GitHub',
    'sign-out': 'Вийти',
    'sign-in-short': 'Увійти',
    'sign-in-required': 'Щоб публікувати додатки, увійдіть через GitHub.',
    'sign-in-why': 'Потрібен лише публічний профіль: імʼя та аватар. Доступу до ваших репозиторіїв каталог не отримує.',
    'banned': 'Ваш обліковий запис заблоковано модератором.',
    'share-title': 'Опублікувати додаток, шпалери чи мод',
    'share-intro': 'Після завантаження файли перевіряє антивірус, а потім модератор. Додаток зʼявиться в каталозі й на Лілці після схвалення.',
    'target': 'Що публікуємо',
    'target-group-new': 'Опублікувати нове',
    'target-group-version': 'Нова версія для',
    'target-new-app': 'Новий додаток або гра',
    'target-new-wallpaper': 'Нові шпалери',
    'target-new-mod': 'Новий мод (корпус, деталь для друку)',
    'target-existing': '{name} — {kind}',
    'section-app-app': 'Про додаток',
    'section-app-wallpaper': 'Про шпалери',
    'section-app-mod': 'Про мод',
    'section-version': 'Версія та файли',
    'kind': 'Тип',
    'kind-app': 'Додаток / гра',
    'kind-wallpaper': 'Шпалери',
    'kind-mod': 'Мод (корпус, деталь для друку)',
    'model-files': 'Файли моделі (STL, 3MF, STEP…)',
    'slug': 'Ідентифікатор',
    'slug-hint': 'Латиниця, цифри та дефіс. Стане частиною адреси й не змінюється.',
    'name-uk': 'Назва (українською)',
    'name-en': 'Назва (англійською)',
    'short-uk': 'Короткий опис (українською)',
    'short-en': 'Короткий опис (англійською)',
    'desc-uk': 'Повний опис, Markdown (українською)',
    'desc-en': 'Повний опис, Markdown (англійською)',
    'sources': 'Вихідний код (посилання)',
    'license': 'Ліцензія',
    'version': 'Версія',
    'keira-version': 'Мінімальна версія Keira',
    'entry-type': 'Тип файлу запуску',
    'entry-lua': 'Lua-скрипт (.lua)',
    'entry-archive': 'Архів (.zip, .tar.gz)',
    'entry-binary': 'Прошивка (.bin)',
    'entry-js': 'mJS-скрипт (.js)',
    'changelog': 'Що нового',
    'entry-file': 'Файл запуску',
    'extra-files': 'Додаткові файли (модулі, ресурси)',
    'icon': 'Іконка (PNG/JPEG)',
    'screenshots': 'Знімки екрана (до 6)',
    'files-hint': 'Імена файлів: латиниця, цифри, крапка, дефіс і підкреслення. До 8 МБ на файл, 24 МБ разом.',
    'submit': 'Надіслати на перевірку',
    'uploading': 'Завантаження… {percent}%',
    'creating': 'Створення додатка…',
    'done-title': 'Надіслано!',
    'done-text': 'Версію {version} отримано. Стан перевірки — у розділі «Мої додатки».',
    'go-my': 'До моїх додатків',
    'my-title': 'Мої додатки',
    'my-empty': 'Ви ще нічого не опублікували.',
    'new-version': 'Нова версія',
    'edit': 'Редагувати',
    'save': 'Зберегти',
    'cancel': 'Скасувати',
    'hide': 'Сховати з каталогу',
    'unhide': 'Повернути в каталог',
    'confirm-hide': 'Сховати додаток із каталогу? Його можна буде повернути.',
    'view-in-catalog': 'Відкрити в каталозі',
    'versions': 'Версії',
    'no-versions': 'Версій ще немає.',
    'rating': '★ {average} ({count})',
    'status-draft': 'чернетка',
    'status-published': 'опубліковано',
    'status-hidden': 'приховано',
    'status-pending_scan': 'перевірка антивірусом',
    'status-pending_review': 'чекає модератора',
    'status-approved': 'схвалено',
    'status-rejected': 'відхилено',
    'status-infected': 'знайдено загрозу',
    'review-note': 'Коментар модератора',
    'scan-detail': 'Результат антивірусу',
    'mod-title': 'Модерація',
    'mod-empty': 'Тут порожньо.',
    'mod-reports': 'Скарги',
    'mod-no-reports': 'Відкритих скарг немає.',
    'approve': 'Схвалити',
    'reject': 'Відхилити',
    'reject-reason': 'Причина відхилення (побачить автор):',
    'approve-note': 'Коментар для автора (необовʼязково):',
    'resolve': 'Закрити скаргу',
    'ban': 'Заблокувати автора',
    'confirm-ban': 'Заблокувати {login}? Усі його додатки буде приховано.',
    'hand-over': 'Передати автору',
    'hand-over-prompt': 'GitHub-логін автора (він має хоча б раз увійти на сайт):',
    'unclaimed': 'ще не передано автору',
    'view': 'Переглянути',
    'download': 'Завантажити',
    'by': 'від',
    'loading': 'Завантаження...',
    'error': 'Помилка: {message}',
    'err-name': 'Файл «{name}»: дозволені лише латиниця, цифри, «.», «_» і «-».',
    'err-dup': 'Імʼя «{name}» використано двічі.',
    'err-size': 'Файл «{name}» більший за 8 МБ.',
    'err-total': 'Разом файли більші за 24 МБ.',
    'err-entry': 'Оберіть файл запуску.',
    'err-entry-type': 'Файл «{name}» не відповідає обраному типу запуску.',
    'err-image': '«{name}» має бути PNG або JPEG.',
    'err-shots': 'Не більше 6 знімків екрана.',
  },
  en: {
    'tab-share': 'Publish',
    'tab-my': 'My apps',
    'tab-mod': 'Moderation',
    'sign-in': 'Sign in with GitHub',
    'sign-out': 'Sign out',
    'sign-in-short': 'Sign in',
    'sign-in-required': 'Sign in with GitHub to publish apps.',
    'sign-in-why': 'Only your public profile is used: name and avatar. The catalog gets no access to your repositories.',
    'banned': 'Your account was banned by a moderator.',
    'share-title': 'Publish an app, wallpaper or mod',
    'share-intro': 'Uploaded files are scanned by an antivirus and then reviewed by a moderator. The app appears in the catalog and on Lilka once approved.',
    'target': 'What to publish',
    'target-group-new': 'Publish something new',
    'target-group-version': 'New version of',
    'target-new-app': 'New app or game',
    'target-new-wallpaper': 'New wallpaper',
    'target-new-mod': 'New mod (case, printable part)',
    'target-existing': '{name} — {kind}',
    'section-app-app': 'About the app',
    'section-app-wallpaper': 'About the wallpaper',
    'section-app-mod': 'About the mod',
    'section-version': 'Version and files',
    'kind': 'Type',
    'kind-app': 'App / game',
    'kind-wallpaper': 'Wallpaper',
    'kind-mod': 'Mod (case, printable part)',
    'model-files': 'Model files (STL, 3MF, STEP…)',
    'slug': 'Identifier',
    'slug-hint': 'Latin letters, digits and dashes. Becomes part of the address and cannot change.',
    'name-uk': 'Name (Ukrainian)',
    'name-en': 'Name (English)',
    'short-uk': 'Short description (Ukrainian)',
    'short-en': 'Short description (English)',
    'desc-uk': 'Full description, Markdown (Ukrainian)',
    'desc-en': 'Full description, Markdown (English)',
    'sources': 'Source code (link)',
    'license': 'License',
    'version': 'Version',
    'keira-version': 'Minimum Keira version',
    'entry-type': 'Entry file type',
    'entry-lua': 'Lua script (.lua)',
    'entry-archive': 'Archive (.zip, .tar.gz)',
    'entry-binary': 'Firmware (.bin)',
    'entry-js': 'mJS script (.js)',
    'changelog': 'What\'s new',
    'entry-file': 'Entry file',
    'extra-files': 'Extra files (modules, resources)',
    'icon': 'Icon (PNG/JPEG)',
    'screenshots': 'Screenshots (up to 6)',
    'files-hint': 'File names: Latin letters, digits, dot, dash and underscore. Up to 8 MB per file, 24 MB total.',
    'submit': 'Send for review',
    'uploading': 'Uploading… {percent}%',
    'creating': 'Creating the app…',
    'done-title': 'Sent!',
    'done-text': 'Version {version} was received. Check its review status in "My apps".',
    'go-my': 'Go to my apps',
    'my-title': 'My apps',
    'my-empty': 'You have not published anything yet.',
    'new-version': 'New version',
    'edit': 'Edit',
    'save': 'Save',
    'cancel': 'Cancel',
    'hide': 'Hide from catalog',
    'unhide': 'Return to catalog',
    'confirm-hide': 'Hide the app from the catalog? You can bring it back later.',
    'view-in-catalog': 'Open in catalog',
    'versions': 'Versions',
    'no-versions': 'No versions yet.',
    'rating': '★ {average} ({count})',
    'status-draft': 'draft',
    'status-published': 'published',
    'status-hidden': 'hidden',
    'status-pending_scan': 'antivirus scan',
    'status-pending_review': 'waiting for moderator',
    'status-approved': 'approved',
    'status-rejected': 'rejected',
    'status-infected': 'threat found',
    'review-note': 'Moderator note',
    'scan-detail': 'Antivirus result',
    'mod-title': 'Moderation',
    'mod-empty': 'Nothing here.',
    'mod-reports': 'Reports',
    'mod-no-reports': 'No open reports.',
    'approve': 'Approve',
    'reject': 'Reject',
    'reject-reason': 'Reason for rejection (the author will see it):',
    'approve-note': 'Note for the author (optional):',
    'resolve': 'Resolve',
    'ban': 'Ban author',
    'confirm-ban': 'Ban {login}? All of their apps will be hidden.',
    'hand-over': 'Hand over to author',
    'hand-over-prompt': 'GitHub login of the author (they must have signed in once):',
    'unclaimed': 'not handed over yet',
    'view': 'View',
    'download': 'Download',
    'by': 'by',
    'loading': 'Loading...',
    'error': 'Error: {message}',
    'err-name': 'File "{name}": only Latin letters, digits, ".", "_" and "-" are allowed.',
    'err-dup': 'Name "{name}" is used twice.',
    'err-size': 'File "{name}" is larger than 8 MB.',
    'err-total': 'Files are larger than 24 MB in total.',
    'err-entry': 'Choose an entry file.',
    'err-entry-type': 'File "{name}" does not match the chosen entry type.',
    'err-image': '"{name}" must be a PNG or JPEG.',
    'err-shots': 'At most 6 screenshots.',
  },
};

// Tab labels live in index.html as [data-i18n]; the main script applies them
Object.assign(UI_STRINGS.uk, COMMUNITY_STRINGS.uk);
Object.assign(UI_STRINGS.en, COMMUNITY_STRINGS.en);

// Same limits and rules as the API, so mistakes show up before a long upload
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_SCREENSHOTS = 6;
const TOKEN_KEY = 'lilka-token';
const LOGIN_STARTED_KEY = 'lilka-login-started';
// GitHub's consent page plus a slow network; the API's OAuth state lives 10 minutes
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

function entryTypeOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.lua')) return 'lua';
  if (lower.endsWith('.js')) return 'js';
  if (lower.endsWith('.bin')) return 'binary';
  if (/\.(zip|tar|tar\.gz|tgz)$/.test(lower)) return 'archive';
  return null;
}

// GitHub mark, inline so the sign-in button needs no extra request
const GITHUB_ICON = '<svg class="github-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 ' +
    '0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 ' +
    '1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15' +
    '-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 ' +
    '2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 ' +
    '1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

class CommunityUI {
  constructor(app) {
    this.app = app;
    this.views = ['share', 'my', 'mod'];
    this.api = this.readApiUrl();
    this.token = null;
    this.user = null;
    this.myApps = [];
    this.modStatus = 'pending_review';
    // Resolves once the session is known, so routing can wait for it
    this.ready = this.api ? this.restoreSession() : Promise.resolve();
  }

  get enabled() {
    return !!this.api;
  }

  handles(type) {
    return this.enabled && this.views.includes(type);
  }

  // <meta name="lilka-api"> in production; a localStorage override is
  // there for developing against `wrangler dev`
  readApiUrl() {
    let url = '';
    try {
      url = localStorage.getItem('lilka-api-url') || '';
    } catch (e) {
      url = '';
    }
    if (!url) {
      const meta = document.querySelector('meta[name="lilka-api"]');
      url = meta ? meta.content.trim() : '';
    }
    return url.replace(/\/$/, '');
  }

  t(key, vars = {}) {
    const strings = COMMUNITY_STRINGS[this.app.currentLang] ||
        COMMUNITY_STRINGS[this.app.defaultLanguage];
    const text = strings[key] || COMMUNITY_STRINGS.en[key] || key;
    return text.replace(/\{(\w+)\}/g, (_, name) =>
        vars[name] !== undefined ? String(vars[name]) : '');
  }

  esc(text) {
    return this.app.escapeHtml(text == null ? '' : String(text));
  }

  // --- Session -------------------------------------------------------------

  async restoreSession() {
    // The API sends the token back in the fragment, which never reaches a
    // server or the analytics script's page URL
    const match = location.hash.match(/lilka_token=([^&]+)/);
    if (match) {
      history.replaceState(history.state, '', location.pathname + location.search);
      // Only a sign-in started in this tab may set the session; otherwise a
      // link carrying someone else's token would quietly sign the visitor in
      // as that person, and their uploads would land in that account
      let started = 0;
      try {
        started = Number(sessionStorage.getItem(LOGIN_STARTED_KEY)) || 0;
        sessionStorage.removeItem(LOGIN_STARTED_KEY);
      } catch (e) {
        started = 0;
      }
      if (Date.now() - started < LOGIN_WINDOW_MS) {
        this.saveToken(decodeURIComponent(match[1]));
      }
    }
    if (!this.token) {
      try {
        this.token = localStorage.getItem(TOKEN_KEY);
      } catch (e) {
        this.token = null;
      }
    }

    if (this.token) {
      try {
        const {user} = await this.request('GET', '/auth/me');
        this.user = user;
      } catch (e) {
        // Expired or revoked: behave as signed out
        this.saveToken(null);
      }
    }
    this.renderAccount();
  }

  saveToken(token) {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      // Private mode: the session then lasts until the tab is closed
    }
  }

  signIn() {
    if (window.umami) window.umami.track('community-sign-in');
    try {
      sessionStorage.setItem(LOGIN_STARTED_KEY, String(Date.now()));
    } catch (e) {
      // Without sessionStorage the returned token is ignored; nothing else to do
    }
    location.href = `${this.api}/auth/login?return=${
        encodeURIComponent(location.href)}`;
  }

  async signOut() {
    try {
      await this.request('POST', '/auth/logout');
    } catch (e) {
      // The token is dropped locally either way
    }
    this.saveToken(null);
    this.user = null;
    this.renderAccount();
    if (this.views.includes(this.app.currentType)) this.show(this.app.currentType);
  }

  renderAccount() {
    const box = document.getElementById('account');
    document.querySelectorAll('.tab-button.community-tab').forEach(btn => {
      btn.hidden = !this.enabled;
    });
    if (!box) return;
    box.hidden = !this.enabled;
    if (!this.enabled) return;

    if (!this.user) {
      box.innerHTML = `
        <button class="account-signin" id="signInBtn">
          ${GITHUB_ICON}<span>${this.esc(this.t('sign-in-short'))}</span>
        </button>`;
      box.querySelector('#signInBtn').addEventListener('click', () => this.signIn());
      return;
    }

    const items = [['my', this.t('tab-my')]];
    if (this.user.role === 'moderator') items.push(['mod', this.t('tab-mod')]);
    box.innerHTML = `
      <button class="account-trigger" aria-haspopup="menu" aria-expanded="false">
        ${this.user.avatar_url ? `<img src="${this.esc(this.avatarUrl(this.user.avatar_url))}" alt="" class="account-avatar">` : ''}
        <span class="account-login">${this.esc(this.user.login)}</span>
        <span class="account-caret" aria-hidden="true">▾</span>
      </button>
      <div class="account-menu" role="menu" hidden>
        ${items.map(([type, label]) =>
            `<button role="menuitem" data-view="${type}">${this.esc(label)}</button>`).join('')}
        <hr>
        <button role="menuitem" class="account-signout">${this.esc(this.t('sign-out'))}</button>
      </div>`;

    const trigger = box.querySelector('.account-trigger');
    const menu = box.querySelector('.account-menu');
    const setOpen = open => {
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    };
    trigger.addEventListener('click', () => setOpen(menu.hidden));
    menu.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
      setOpen(false);
      if (window.umami) window.umami.track('tab-navigation', {tab: btn.dataset.view});
      this.show(btn.dataset.view);
    }));
    menu.querySelector('.account-signout').addEventListener('click', () => {
      setOpen(false);
      this.signOut();
    });

    // The menu is rebuilt on every render, so close it via whatever is current
    if (!this.menuListeners) {
      this.menuListeners = true;
      document.addEventListener('click', e => {
        const current = document.querySelector('#account .account-menu');
        if (current && !current.hidden && !e.target.closest('#account')) {
          current.hidden = true;
          document.querySelector('#account .account-trigger')
              .setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', e => {
        const current = document.querySelector('#account .account-menu');
        if (e.key === 'Escape' && current && !current.hidden) {
          current.hidden = true;
          const btn = document.querySelector('#account .account-trigger');
          btn.setAttribute('aria-expanded', 'false');
          btn.focus();
        }
      });
    }
  }

  avatarUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('s', '48');
      return parsed.toString();
    } catch (e) {
      return url;
    }
  }

  // --- API -------------------------------------------------------------------

  async request(method, path, body) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${this.api}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  // fetch() cannot report upload progress, XMLHttpRequest can
  upload(path, form, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.api}${path}`);
      if (this.token) xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener('load', () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || `HTTP ${xhr.status}`));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('network error')));
      xhr.send(form);
    });
  }

  // Unapproved files need the session, so plain links would not work
  async fetchFile(url) {
    const response = await fetch(url, {
      headers: this.token ? {Authorization: `Bearer ${this.token}`} : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  }

  // --- Views -----------------------------------------------------------------

  container() {
    return document.getElementById('community');
  }

  async show(type, params = new URLSearchParams()) {
    await this.ready;
    this.app.currentType = type;
    this.app.showView(type);
    const query = new URLSearchParams();
    query.set('type', type);
    if (type === 'share' && params.get('app')) query.set('app', params.get('app'));
    if (location.search !== `?${query}`) {
      history.pushState({type}, '', `?${query}`);
    }
    window.scrollTo({top: 0});

    const box = this.container();
    if (!this.user) {
      box.innerHTML = this.renderSignInPrompt();
      box.querySelector('.community-sign-in').addEventListener('click', () => this.signIn());
      return;
    }
    if (this.user.role === 'banned') {
      box.innerHTML = `<div class="community-panel"><p>${this.esc(this.t('banned'))}</p></div>`;
      return;
    }

    box.innerHTML = `<div class="loading">${this.esc(this.t('loading'))}</div>`;
    try {
      if (type === 'share') await this.showShare(params.get('app'));
      if (type === 'my') await this.showMyApps();
      if (type === 'mod') await this.showModeration();
    } catch (error) {
      box.innerHTML = `<div class="error" style="display:block">${
          this.esc(this.t('error', {message: error.message}))}</div>`;
    }
  }

  // Re-render after a language switch
  refresh() {
    this.renderAccount();
    if (this.views.includes(this.app.currentType)) {
      const params = new URLSearchParams(location.search);
      this.show(this.app.currentType, params);
    }
  }

  renderSignInPrompt() {
    return `
      <div class="community-panel community-center">
        <p>${this.esc(this.t('sign-in-required'))}</p>
        <button class="download-btn community-sign-in">${this.esc(this.t('sign-in'))}</button>
        <p class="community-hint">${this.esc(this.t('sign-in-why'))}</p>
      </div>`;
  }

  statusBadge(status) {
    return `<span class="status-badge status-${this.esc(status)}">${
        this.esc(this.t(`status-${status}`))}</span>`;
  }

  appName(app) {
    const name = app.name || {};
    return name[this.app.currentLang] || name.uk || name.en || app.slug;
  }

  async loadMyApps() {
    const {items} = await this.request(
        'GET', `/users/${encodeURIComponent(this.user.login)}/apps`);
    // The list carries only the latest approved version; owners need all of
    // them with their review state
    this.myApps = await Promise.all(
        items.map(a => this.request('GET', `/apps/${encodeURIComponent(a.slug)}`)));
    return this.myApps;
  }

  // --- Publish ---------------------------------------------------------------

  async showShare(preselect) {
    const apps = await this.loadMyApps();
    const box = this.container();
    const field = (id, label, input, hint = '') => `
      <label class="form-field" for="${id}">
        <span class="form-label">${this.esc(this.t(label))}</span>
        ${input}
        ${hint ? `<span class="community-hint">${this.esc(this.t(hint))}</span>` : ''}
      </label>`;

    box.innerHTML = `
      <div class="community-panel">
        <h2>${this.esc(this.t('share-title'))}</h2>
        <p class="community-hint">${this.esc(this.t('share-intro'))}</p>
        <form id="shareForm" class="community-form" novalidate>
          ${field('target', 'target', `
            <select id="target" name="target">
              <optgroup label="${this.esc(this.t('target-group-new'))}">
                ${['app', 'wallpaper', 'mod'].map(kind => `<option value="new:${kind}">${
                    this.esc(this.t(`target-new-${kind}`))}</option>`).join('')}
              </optgroup>
              ${apps.length ? `<optgroup label="${this.esc(this.t('target-group-version'))}">
                ${apps.map(a => this.targetOption(a.slug, this.appName(a), a.kind, a.slug === preselect)).join('')}
              </optgroup>` : ''}
            </select>`)}

          <fieldset id="appFields">
            <legend id="appLegend"></legend>
            <div class="form-row">
              ${field('slug', 'slug', '<input id="slug" name="slug" maxlength="48" autocomplete="off">', 'slug-hint')}
            </div>
            <div class="form-row">
              ${field('name_uk', 'name-uk', '<input id="name_uk" name="name_uk" maxlength="64">')}
              ${field('name_en', 'name-en', '<input id="name_en" name="name_en" maxlength="64">')}
            </div>
            <div class="form-row">
              ${field('short_uk', 'short-uk', '<input id="short_uk" name="short_uk" maxlength="200">')}
              ${field('short_en', 'short-en', '<input id="short_en" name="short_en" maxlength="200">')}
            </div>
            <div class="form-row">
              ${field('description_uk', 'desc-uk', '<textarea id="description_uk" name="description_uk" rows="5"></textarea>')}
              ${field('description_en', 'desc-en', '<textarea id="description_en" name="description_en" rows="5"></textarea>')}
            </div>
            <div class="form-row">
              ${field('sources_url', 'sources', '<input id="sources_url" name="sources_url" type="url" placeholder="https://github.com/you/your-game">')}
              ${field('license', 'license', '<input id="license" name="license" maxlength="64" placeholder="MIT">')}
            </div>
          </fieldset>

          <fieldset>
            <legend>${this.esc(this.t('section-version'))}</legend>
            <div class="form-row">
              ${field('version', 'version', '<input id="version" name="version" maxlength="32" value="1.0.0">')}
              <div class="program-only">${field('keira_version', 'keira-version', '<input id="keira_version" name="keira_version" maxlength="32" value="1.0.0">')}</div>
              <div class="program-only">${field('entry_type', 'entry-type', `
                <select id="entry_type" name="entry_type">
                  <option value="lua">${this.esc(this.t('entry-lua'))}</option>
                  <option value="archive">${this.esc(this.t('entry-archive'))}</option>
                  <option value="binary">${this.esc(this.t('entry-binary'))}</option>
                  <option value="js">${this.esc(this.t('entry-js'))}</option>
                </select>`)}</div>
            </div>
            ${field('changelog', 'changelog', '<textarea id="changelog" name="changelog" rows="3"></textarea>')}
            <div class="form-row">
              <div class="program-only">${field('entry', 'entry-file', '<input id="entry" name="entry" type="file" accept=".lua,.js,.zip,.tar,.gz,.tgz,.bin">')}</div>
              <label class="form-field" for="files">
                <span class="form-label" id="filesLabel">${this.esc(this.t('extra-files'))}</span>
                <input id="files" name="files" type="file" multiple>
              </label>
            </div>
            <div class="form-row">
              ${field('icon', 'icon', '<input id="icon" name="icon" type="file" accept="image/png,image/jpeg">')}
              ${field('screenshots', 'screenshots', '<input id="screenshots" name="screenshots" type="file" accept="image/png,image/jpeg" multiple>')}
            </div>
            <p class="community-hint">${this.esc(this.t('files-hint'))}</p>
          </fieldset>

          <div class="form-error" id="shareError" hidden></div>
          <div class="form-actions">
            <button type="submit" class="download-btn" id="shareSubmit">${this.esc(this.t('submit'))}</button>
            <span class="community-hint" id="shareProgress"></span>
          </div>
        </form>
      </div>`;

    const form = box.querySelector('#shareForm');
    const target = form.querySelector('#target');
    // The one dropdown says both what kind of thing it is and whether it is
    // new: `new:<kind>` creates an item, anything else is the slug of one of
    // the user's items that gets a new version. A mod is a printable part:
    // no entry file and no Keira version
    const syncTarget = () => {
      const isNew = target.value.startsWith('new:');
      const existing = apps.find(a => a.slug === target.value);
      const kind = isNew ? target.value.slice(4) : (existing ? existing.kind : 'app');
      form.dataset.kind = kind;
      form.querySelector('#appFields').hidden = !isNew;
      form.querySelector('#appLegend').textContent = this.t(`section-app-${kind}`);
      form.querySelector('#slug').placeholder = {app: 'my-game', wallpaper: 'my-wallpaper', mod: 'my-case'}[kind];
      const isMod = kind === 'mod';
      form.querySelectorAll('.program-only').forEach(el => el.hidden = isMod);
      form.querySelector('#filesLabel').textContent = this.t(isMod ? 'model-files' : 'extra-files');
    };
    target.addEventListener('change', syncTarget);
    syncTarget();

    // Suggest an identifier from the name until the user types their own
    const slug = form.querySelector('#slug');
    let slugTouched = false;
    slug.addEventListener('input', () => {
      slugTouched = true;
    });
    for (const id of ['name_en', 'name_uk']) {
      form.querySelector(`#${id}`).addEventListener('input', () => {
        if (slugTouched) return;
        const source = form.querySelector('#name_en').value || form.querySelector('#name_uk').value;
        slug.value = source.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
      });
    }

    form.querySelector('#entry').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const type = file && entryTypeOf(file.name);
      if (type) form.querySelector('#entry_type').value = type;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitShare(form);
    });
  }

  targetOption(slug, name, kind, selected) {
    return `<option value="${this.esc(slug)}"${selected ? ' selected' : ''}>${
        this.esc(this.t('target-existing', {name, kind: this.t(`kind-${kind}`)}))}</option>`;
  }

  validateFiles(form) {
    const entry = form.querySelector('#entry').files[0];
    const extra = [...form.querySelector('#files').files];
    const icon = [...form.querySelector('#icon').files];
    const shots = [...form.querySelector('#screenshots').files];
    const entryType = form.querySelector('#entry_type').value;
    const isMod = form.dataset.kind === 'mod';

    if (!isMod) {
      if (!entry) return this.t('err-entry');
      if (entryTypeOf(entry.name) !== entryType) return this.t('err-entry-type', {name: entry.name});
    }
    if (shots.length > MAX_SCREENSHOTS) return this.t('err-shots');

    // The same picture may be both the icon and a screenshot
    const seen = new Map();
    let total = 0;
    for (const file of [...(isMod || !entry ? [] : [entry]), ...extra, ...icon, ...shots]) {
      if (!FILENAME_RE.test(file.name)) return this.t('err-name', {name: file.name});
      if (seen.has(file.name)) {
        if (seen.get(file.name) !== file.size) return this.t('err-dup', {name: file.name});
        continue;
      }
      seen.set(file.name, file.size);
      if (file.size > MAX_FILE_BYTES) return this.t('err-size', {name: file.name});
      total += file.size;
    }
    if (total > MAX_UPLOAD_BYTES) return this.t('err-total');
    for (const file of [...icon, ...shots]) {
      if (!/\.(png|jpe?g)$/i.test(file.name)) return this.t('err-image', {name: file.name});
    }
    return null;
  }

  async submitShare(form) {
    const errorBox = form.querySelector('#shareError');
    const progress = form.querySelector('#shareProgress');
    const submit = form.querySelector('#shareSubmit');
    const value = (id) => form.querySelector(`#${id}`).value.trim();
    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
      progress.textContent = '';
      submit.disabled = false;
    };

    errorBox.hidden = true;
    const fileError = this.validateFiles(form);
    if (fileError) return showError(fileError);

    const isNew = value('target').startsWith('new:');
    let slug = value('target');
    if (isNew) {
      slug = value('slug');
      if (!SLUG_RE.test(slug)) return showError(`${this.t('slug')}: ${this.t('slug-hint')}`);
    }

    submit.disabled = true;
    try {
      if (isNew) {
        progress.textContent = this.t('creating');
        await this.request('POST', '/apps', {
          slug,
          kind: form.dataset.kind,
          name: {uk: value('name_uk'), en: value('name_en')},
          short_description: {uk: value('short_uk'), en: value('short_en')},
          description: {uk: value('description_uk'), en: value('description_en')},
          sources_url: value('sources_url'),
          license: value('license'),
        });
        // If the upload below fails, a retry must add a version to this app
        // instead of trying to create it again
        const target = form.querySelector('#target');
        target.insertAdjacentHTML('beforeend', this.targetOption(
            slug, value('name_uk') || value('name_en') || slug, form.dataset.kind, true));
        target.value = slug;
        form.querySelector('#appFields').hidden = true;
      }

      const data = new FormData();
      const isMod = form.dataset.kind === 'mod';
      const ids = isMod ? ['version', 'changelog'] :
                          ['version', 'keira_version', 'entry_type', 'changelog'];
      for (const id of ids) data.append(id, value(id));
      if (!isMod) data.append('entry', form.querySelector('#entry').files[0]);
      for (const id of ['files', 'icon', 'screenshots']) {
        for (const file of form.querySelector(`#${id}`).files) data.append(id, file);
      }

      const version = await this.upload(
          `/apps/${encodeURIComponent(slug)}/versions`, data,
          (percent) => progress.textContent = this.t('uploading', {percent}));
      if (window.umami) window.umami.track('community-upload', {app: slug});
      this.renderShareDone(version);
    } catch (error) {
      showError(this.t('error', {message: error.message}));
    }
  }

  renderShareDone(version) {
    const box = this.container();
    box.innerHTML = `
      <div class="community-panel community-center">
        <h2>✅ ${this.esc(this.t('done-title'))}</h2>
        <p>${this.esc(this.t('done-text', {version: version.version}))}</p>
        <button class="download-btn" id="goMy">${this.esc(this.t('go-my'))}</button>
      </div>`;
    box.querySelector('#goMy').addEventListener('click', () => this.show('my'));
  }

  // --- My apps ---------------------------------------------------------------

  async showMyApps() {
    const apps = await this.loadMyApps();
    const box = this.container();
    if (!apps.length) {
      box.innerHTML = `
        <div class="community-panel community-center">
          <h2>${this.esc(this.t('my-title'))}</h2>
          <p>${this.esc(this.t('my-empty'))}</p>
          <button class="download-btn" id="goShare">${this.esc(this.t('share-title'))}</button>
        </div>`;
      box.querySelector('#goShare').addEventListener('click', () => this.show('share'));
      return;
    }

    box.innerHTML = `<h2 class="community-title">${this.esc(this.t('my-title'))}</h2>
      <div class="community-list">${apps.map(a => this.renderMyApp(a)).join('')}</div>`;

    box.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this.onMyAppAction(btn));
    });
    this.bindFileButtons(box);
  }

  renderMyApp(app) {
    const [catalogType] = app.catalog_path.split('/');
    const rating = app.rating && app.rating.count ?
        `<span class="community-hint">${this.esc(this.t('rating', app.rating))}</span>` : '';
    return `
      <div class="community-card" data-slug="${this.esc(app.slug)}">
        <div class="community-card-head">
          <div>
            <h3>${this.esc(this.appName(app))}</h3>
            <code class="community-slug">${this.esc(app.slug)}</code>
            ${this.statusBadge(app.status)} ${rating}
          </div>
          <div class="community-actions">
            <button class="btn-sm" data-action="new-version">${this.esc(this.t('new-version'))}</button>
            <button class="btn-sm" data-action="edit">${this.esc(this.t('edit'))}</button>
            ${app.status === 'published' ?
                `<a class="btn-sm" href="?type=${catalogType}&item=${encodeURIComponent(app.slug)}">${this.esc(this.t('view-in-catalog'))}</a>
                 <button class="btn-sm" data-action="hide">${this.esc(this.t('hide'))}</button>` : ''}
            ${app.status === 'hidden' ?
                `<button class="btn-sm" data-action="unhide">${this.esc(this.t('unhide'))}</button>` : ''}
          </div>
        </div>
        <div class="community-edit" hidden></div>
        <h4>${this.esc(this.t('versions'))}</h4>
        ${app.versions.length ? app.versions.map(v => this.renderVersion(v)).join('') :
            `<p class="community-hint">${this.esc(this.t('no-versions'))}</p>`}
      </div>`;
  }

  renderVersion(v, withFiles = true) {
    const notes = [];
    if (v.review_note) {
      notes.push(`<div class="community-note"><strong>${this.esc(this.t('review-note'))}:</strong> ${this.esc(v.review_note)}</div>`);
    }
    if (v.scan_detail && v.status === 'infected') {
      notes.push(`<pre class="community-note">${this.esc(v.scan_detail)}</pre>`);
    }
    const files = [v.entry, ...v.files, v.icon, ...v.screenshots]
        .filter((f, i, all) => f && all.findIndex(o => o && o.name === f.name) === i);
    const meta = v.entry_type ?
        `${this.esc(v.entry_type)} · Keira ≥ ${this.esc(v.keira_version)} · ${this.esc(v.created_at)}` :
        this.esc(v.created_at);
    return `
      <div class="community-version">
        <div class="community-version-head">
          <strong>${this.esc(v.version)}</strong>
          ${this.statusBadge(v.status)}
          <span class="community-hint">${meta}</span>
        </div>
        ${v.changelog ? `<div class="community-hint">${this.esc(v.changelog)}</div>` : ''}
        ${notes.join('')}
        ${withFiles ? `<div class="community-files">${files.map(f => `
          <span class="community-file">
            ${this.esc(f.name)}
            <button class="btn-sm" data-file-view="${this.esc(f.url)}" data-name="${this.esc(f.name)}">${this.esc(this.t('view'))}</button>
            <button class="btn-sm" data-file-download="${this.esc(f.url)}" data-name="${this.esc(f.name)}">⬇</button>
          </span>`).join('')}</div>
          <div class="community-preview" hidden></div>` : ''}
      </div>`;
  }

  // Lua and text open inline (that is what a reviewer reads), images as
  // pictures, everything else downloads
  bindFileButtons(root) {
    root.querySelectorAll('[data-file-view]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const preview = btn.closest('.community-version').querySelector('.community-preview');
        const name = btn.dataset.name;
        try {
          const blob = await this.fetchFile(btn.dataset.fileView);
          if (/\.(png|jpe?g)$/i.test(name)) {
            preview.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="${this.esc(name)}">`;
          } else if (/\.(lua|txt|md|json)$/i.test(name)) {
            const code = document.createElement('code');
            code.className = 'language-lua';
            code.textContent = await blob.text();
            preview.innerHTML = '<pre></pre>';
            preview.querySelector('pre').appendChild(code);
            if (window.hljs) window.hljs.highlightElement(code);
          } else {
            this.saveBlob(blob, name);
            return;
          }
          preview.hidden = false;
        } catch (error) {
          preview.textContent = this.t('error', {message: error.message});
          preview.hidden = false;
        }
      });
    });
    root.querySelectorAll('[data-file-download]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          this.saveBlob(await this.fetchFile(btn.dataset.fileDownload), btn.dataset.name);
        } catch (error) {
          alert(this.t('error', {message: error.message}));
        }
      });
    });
  }

  saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async onMyAppAction(btn) {
    const card = btn.closest('.community-card');
    const slug = card.dataset.slug;
    const action = btn.dataset.action;
    const path = `/apps/${encodeURIComponent(slug)}`;
    try {
      if (action === 'new-version') {
        this.show('share', new URLSearchParams({app: slug}));
        return;
      }
      if (action === 'edit') {
        this.renderEditForm(card, this.myApps.find(a => a.slug === slug));
        return;
      }
      if (action === 'hide') {
        if (!confirm(this.t('confirm-hide'))) return;
        await this.request('PATCH', path, {status: 'hidden'});
      }
      if (action === 'unhide') {
        await this.request('PATCH', path, {status: 'published'});
      }
      await this.showMyApps();
    } catch (error) {
      alert(this.t('error', {message: error.message}));
    }
  }

  renderEditForm(card, app) {
    const box = card.querySelector('.community-edit');
    const input = (id, label, value, tag = 'input') => `
      <label class="form-field"><span class="form-label">${this.esc(this.t(label))}</span>
        ${tag === 'textarea' ?
            `<textarea data-field="${id}" rows="4">${this.esc(value)}</textarea>` :
            `<input data-field="${id}" value="${this.esc(value)}">`}
      </label>`;
    const n = app.name || {}, s = app.short_description || {}, d = app.description || {};
    box.innerHTML = `
      <div class="community-form">
        <div class="form-row">${input('name_uk', 'name-uk', n.uk)}${input('name_en', 'name-en', n.en)}</div>
        <div class="form-row">${input('short_uk', 'short-uk', s.uk)}${input('short_en', 'short-en', s.en)}</div>
        <div class="form-row">${input('description_uk', 'desc-uk', d.uk, 'textarea')}${input('description_en', 'desc-en', d.en, 'textarea')}</div>
        <div class="form-row">${input('sources_url', 'sources', app.sources_url)}${input('license', 'license', app.license)}</div>
        <div class="form-error" hidden></div>
        <div class="form-actions">
          <button class="download-btn" data-edit="save">${this.esc(this.t('save'))}</button>
          <button class="btn-sm" data-edit="cancel">${this.esc(this.t('cancel'))}</button>
        </div>
      </div>`;
    box.hidden = false;
    const get = (id) => box.querySelector(`[data-field="${id}"]`).value.trim();
    box.querySelector('[data-edit="cancel"]').addEventListener('click', () => {
      box.hidden = true;
    });
    box.querySelector('[data-edit="save"]').addEventListener('click', async () => {
      try {
        await this.request('PATCH', `/apps/${encodeURIComponent(app.slug)}`, {
          name: {uk: get('name_uk'), en: get('name_en')},
          short_description: {uk: get('short_uk'), en: get('short_en')},
          description: {uk: get('description_uk'), en: get('description_en')},
          sources_url: get('sources_url'),
          license: get('license'),
        });
        await this.showMyApps();
      } catch (error) {
        const errorBox = box.querySelector('.form-error');
        errorBox.textContent = this.t('error', {message: error.message});
        errorBox.hidden = false;
      }
    });
  }

  // --- Moderation ------------------------------------------------------------

  async showModeration() {
    const statuses = ['pending_review', 'pending_scan', 'infected', 'rejected', 'approved'];
    const [queue, reports] = await Promise.all([
      this.request('GET', `/mod/queue?status=${this.modStatus}`),
      this.request('GET', '/mod/reports'),
    ]);
    const box = this.container();

    box.innerHTML = `
      <h2 class="community-title">${this.esc(this.t('mod-title'))}</h2>
      <div class="community-filter">
        ${statuses.map(s => `<button class="page-btn ${s === this.modStatus ? 'active' : ''}" data-status="${s}">${
            this.esc(this.t(`status-${s}`))}</button>`).join('')}
      </div>
      <div class="community-list">
        ${queue.items.length ? queue.items.map(item => this.renderQueueItem(item)).join('') :
            `<p class="community-hint">${this.esc(this.t('mod-empty'))}</p>`}
      </div>
      <h3 class="community-title">${this.esc(this.t('mod-reports'))}</h3>
      <div class="community-list">
        ${reports.items.length ? reports.items.map(r => `
          <div class="community-card" data-report="${r.id}">
            <div class="community-card-head">
              <div>
                <code class="community-slug">${this.esc(r.slug)}</code>
                <span class="community-hint">${this.esc(this.t('by'))} ${this.esc(r.reporter)} · ${this.esc(r.created_at)}</span>
                <p>${this.esc(r.reason)}</p>
              </div>
              <div class="community-actions">
                <button class="btn-sm" data-resolve="${r.id}">${this.esc(this.t('resolve'))}</button>
              </div>
            </div>
          </div>`).join('') : `<p class="community-hint">${this.esc(this.t('mod-no-reports'))}</p>`}
      </div>`;

    box.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.modStatus = btn.dataset.status;
        this.show('mod');
      });
    });
    box.querySelectorAll('[data-mod]').forEach(btn => {
      btn.addEventListener('click', () => this.onModAction(btn));
    });
    box.querySelectorAll('[data-resolve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.request('POST', `/mod/reports/${btn.dataset.resolve}/resolve`);
        this.show('mod');
      });
    });
    this.bindFileButtons(box);
  }

  renderQueueItem({app, version}) {
    const name = app.name[this.app.currentLang] || app.name.uk || app.name.en || app.slug;
    const checksums = (version.checksums || []).map(c =>
        `<div class="community-hint"><code>${this.esc(c.name)}</code> · ${c.size} B · sha256 <code>${this.esc(c.sha256.slice(0, 16))}…</code></div>`).join('');
    const canApprove = version.status === 'pending_review';
    const canReject = version.status !== 'approved';
    return `
      <div class="community-card" data-version="${version.id}" data-owner="${this.esc(app.owner)}" data-slug="${this.esc(app.slug)}" data-author="${this.esc(app.author || '')}">
        <div class="community-card-head">
          <div>
            <h3>${this.esc(name)}</h3>
            <code class="community-slug">${this.esc(app.slug)}</code>
            <span class="community-hint">${this.esc(app.kind)} · ${this.esc(this.t('by'))} ${this.esc(app.author || app.owner)}${
                app.unclaimed ? ` · ${this.esc(this.t('unclaimed'))}` : ''}</span>
          </div>
          <div class="community-actions">
            ${canApprove ? `<button class="download-btn" data-mod="approve">${this.esc(this.t('approve'))}</button>` : ''}
            ${canReject ? `<button class="btn-sm" data-mod="reject">${this.esc(this.t('reject'))}</button>` : ''}
            ${app.unclaimed ?
                // Imported apps are owned by the catalog account: banning it
                // would hide all of them, so the action here is the hand-over
                `<button class="btn-sm" data-mod="hand-over">${this.esc(this.t('hand-over'))}</button>` :
                `<button class="btn-sm danger" data-mod="ban">${this.esc(this.t('ban'))}</button>`}
          </div>
        </div>
        ${this.renderVersion(version)}
        ${version.scan_detail && version.status !== 'infected' ?
            `<div class="community-hint">${this.esc(this.t('scan-detail'))}: ${this.esc(version.scan_detail)}</div>` : ''}
        ${checksums}
      </div>`;
  }

  async onModAction(btn) {
    const card = btn.closest('.community-card');
    const id = card.dataset.version;
    try {
      if (btn.dataset.mod === 'approve') {
        const note = prompt(this.t('approve-note'), '');
        if (note === null) return;
        await this.request('POST', `/mod/versions/${id}/approve`, {note: note || undefined});
      }
      if (btn.dataset.mod === 'reject') {
        const note = prompt(this.t('reject-reason'), '');
        if (!note) return;
        await this.request('POST', `/mod/versions/${id}/reject`, {note});
      }
      if (btn.dataset.mod === 'hand-over') {
        const login = prompt(this.t('hand-over-prompt'), card.dataset.author.replace(/^@/, ''));
        if (!login) return;
        await this.request('PATCH', `/apps/${encodeURIComponent(card.dataset.slug)}`, {owner: login.trim()});
      }
      if (btn.dataset.mod === 'ban') {
        const login = card.dataset.owner;
        if (!confirm(this.t('confirm-ban', {login}))) return;
        await this.request('POST', `/mod/users/${encodeURIComponent(login)}/ban`);
      }
      this.show('mod');
    } catch (error) {
      alert(this.t('error', {message: error.message}));
    }
  }
}
