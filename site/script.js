// Static UI strings per language, applied to elements with [data-i18n]
// Cards per page; listing.json holds every item, pages are cut here
const PAGE_SIZE = 12;
const SORTS = ['newest', 'updated', 'name', 'author'];
const DEFAULT_SORT = 'newest';

const UI_STRINGS = {
  uk: {
    'subtitle': 'Ігри, інструменти та модифікації для DIY-консолі Лілка',
    'tab-apps': 'Додатки',
    'tab-wallpapers': 'Шпалери',
    'tab-mods': 'Моди',
    'tab-authors': 'Автори',
    'loading': 'Завантаження...',
    'sort-label': 'Сортувати',
    'sort-newest': 'Нові',
    'sort-updated': 'Нещодавно оновлені',
    'sort-name': 'Назва',
    'sort-author': 'Автор',
    'sort-reverse': 'Зворотний порядок',
    'card-added': 'Додано {date}',
    'card-updated': 'Оновлено {date}',
    'authors-title': 'Автори',
    'authors-summary': 'Авторів: {authors} · елементів: {items}',
    'authors-search': 'Пошук автора або додатка',
    'authors-sort-items': 'Найбільше елементів',
    'authors-sort-recent': 'Нещодавно активні',
    'authors-sort-name': 'Імʼя',
    'authors-sort-newest': 'Нові автори',
    'authors-all': 'Усі',
    'authors-empty': 'Нікого не знайдено.',
    'authors-error': 'Не вдалося завантажити авторів: {message}',
    'author-back': 'Усі автори',
    'author-github': 'Профіль GitHub',
    'author-website': 'Сайт',
    'author-printables': 'Профіль Printables',
    'author-first': 'Перший елемент: {date}',
    'author-last': 'Останнє оновлення: {date}',
    'author-active': 'Активність: {date}',
    'author-copy': 'Копіювати посилання',
    'author-copied': 'Скопійовано',
    'author-verified': 'Підтверджений GitHub',
    'author-verified-hint': 'Увійшов на сайт через GitHub і володіє цими елементами',
    'author-not-found': 'Автора «{name}» не знайдено.',
    'author-items': 'Роботи',
    'kind-apps': 'Додатки',
    'kind-wallpapers': 'Шпалери',
    'kind-mods': 'Моди',
    'kind-one-apps': 'Додаток',
    'kind-one-wallpapers': 'Шпалери',
    'kind-one-mods': 'Мод',
    'av-info-title': 'Як ми перевіряємо файли',
    'av-info-1': 'Кожен файл для завантаження (включно з package.zip) перевіряється антивірусом ClamAV у GitHub Actions одразу після завантаження в каталог, ще до публікації.',
    'av-info-2': 'Перед скануванням бази сигнатур оновлюються до найновіших (freshclam).',
    'av-info-3': 'Вміст архівів також сканується.',
    'av-info-4': 'Для кожного файлу публікуються контрольні суми SHA-256 та MD5 — порівняйте їх із завантаженим файлом, щоб переконатися, що його не змінено.',
    'av-info-5': 'Антивірус не дає 100% гарантії — завантажуйте лише ті застосунки, авторам яких довіряєте.',
  },
  en: {
    'subtitle': 'Games, tools, and modifications for the Lilka DIY console',
    'tab-apps': 'Apps',
    'tab-wallpapers': 'Wallpapers',
    'tab-mods': 'Mods',
    'tab-authors': 'Authors',
    'loading': 'Loading...',
    'sort-label': 'Sort by',
    'sort-newest': 'Newest',
    'sort-updated': 'Recently updated',
    'sort-name': 'Name',
    'sort-author': 'Author',
    'sort-reverse': 'Reverse order',
    'card-added': 'Added {date}',
    'card-updated': 'Updated {date}',
    'authors-title': 'Authors',
    'authors-summary': '{authors} authors · {items} items',
    'authors-search': 'Search authors or items',
    'authors-sort-items': 'Most items',
    'authors-sort-recent': 'Recently active',
    'authors-sort-name': 'Name',
    'authors-sort-newest': 'Newest authors',
    'authors-all': 'All',
    'authors-empty': 'Nobody found.',
    'authors-error': 'Failed to load authors: {message}',
    'author-back': 'All authors',
    'author-github': 'GitHub profile',
    'author-website': 'Website',
    'author-printables': 'Printables profile',
    'author-first': 'First item: {date}',
    'author-last': 'Last update: {date}',
    'author-active': 'Active {date}',
    'author-copy': 'Copy link',
    'author-copied': 'Copied',
    'author-verified': 'Verified GitHub',
    'author-verified-hint': 'Signed in with GitHub and owns these items',
    'author-not-found': 'Author "{name}" not found.',
    'author-items': 'Works',
    'kind-apps': 'Apps',
    'kind-wallpapers': 'Wallpapers',
    'kind-mods': 'Mods',
    'kind-one-apps': 'App',
    'kind-one-wallpapers': 'Wallpaper',
    'kind-one-mods': 'Mod',
    'av-info-title': 'How we check files',
    'av-info-1': 'Every downloadable file (including package.zip) is scanned with the ClamAV antivirus in GitHub Actions right after it is uploaded, before it is published.',
    'av-info-2': 'Virus signature databases are updated to the latest version (freshclam) right before scanning.',
    'av-info-3': 'Contents of archives are scanned too.',
    'av-info-4': 'SHA-256 and MD5 checksums are published for every file — compare them with your download to make sure it was not modified.',
    'av-info-5': 'No antivirus is a 100% guarantee — only install apps from authors you trust.',
  },
};

class LilkaRepository {
  constructor() {
    this.currentType = 'apps';
    this.currentPage = 0;
    this.totalPages = 0;
    this.manifests = [];
    this.currentScreenshots = [];
    this.currentLightboxIndex = 0;
    this.supportedLanguages = ['uk', 'en'];
    this.defaultLanguage = 'uk';
    this.currentLang = this.loadLanguage();
    this.dataBase = this.readDataBase();
    this.sort = this.loadSort();
    // Flips the sort's own direction: oldest first, Z to A
    this.sortReverse = this.loadSortReverse();
    // listing.json per kind, fetched once per visit
    this.listings = {};
    // community.js is optional: without it the catalog stays read-only
    this.community =
        typeof CommunityUI !== 'undefined' ? new CommunityUI(this) : null;
    this.init();
  }

  loadLanguage() {
    let lang = null;
    try {
      lang = localStorage.getItem('lilka-lang');
    } catch (e) {
      lang = null;
    }
    if (!this.supportedLanguages.includes(lang)) {
      const browser = (navigator.language || '').slice(0, 2).toLowerCase();
      lang = this.supportedLanguages.includes(browser) ? browser :
                                                         this.defaultLanguage;
    }
    return lang;
  }

  setLanguage(lang) {
    if (!this.supportedLanguages.includes(lang) || lang === this.currentLang) {
      return;
    }
    this.currentLang = lang;
    try {
      localStorage.setItem('lilka-lang', lang);
    } catch (e) {
      // ignore storage errors (private mode, etc.)
    }
    this.updateLangSwitcher();
    this.refreshLocalizedContent();
  }

  updateLangSwitcher() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
    });
    document.documentElement.lang = this.currentLang;
    this.applyUiStrings();
  }

  // Apply static UI translations to all [data-i18n] elements
  applyUiStrings() {
    const strings =
        UI_STRINGS[this.currentLang] || UI_STRINGS[this.defaultLanguage];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const text = strings[el.dataset.i18n];
      if (text) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const text = strings[el.dataset.i18nTitle];
      if (text) el.title = text;
    });
  }

  // Re-render currently visible content using the selected language
  refreshLocalizedContent() {
    if (this.community) this.community.renderAccount();
    if (this.isCommunityView(this.currentType)) {
      this.community.refresh();
    } else if (this.currentType === 'authors') {
      this.showAuthors({push: false});
    } else {
      this.loadPage();
    }
    // If a modal is open, re-render it with the new language
    const modal = document.getElementById('modal');
    if (modal && modal.style.display === 'block' && this._currentManifest &&
        this._currentManifestName) {
      this.showModal(this._currentManifest, this._currentManifestName, this._currentManifestType);
    }
  }

  // Return the value of a localizable field for the current language,
  // falling back to the default language and then the top-level field.
  localized(item, field) {
    if (item && item.localization) {
      const order = [this.currentLang, this.defaultLanguage].concat(
          this.supportedLanguages);
      for (const lang of order) {
        const entry = item.localization[lang];
        if (entry && entry[field] != null && entry[field] !== '') {
          return entry[field];
        }
      }
    }
    return item ? item[field] : undefined;
  }

  // The public catalog is read from the Pages mirror next to the site, the
  // same copy of the API's /catalog tree that Keira downloads. Every request
  // to the API counts against the Worker's daily limit even when it is
  // answered from a cache, and one list page is 25 of them (index, 12
  // manifests, 12 icons); the mirror is served by GitHub's CDN for free.
  // Sign-in, publishing and moderation still talk to the API (community.js).
  //
  // The price is freshness: an approval reaches the mirror on its next
  // rebuild (right away with the API's dispatch token, otherwise hourly).
  // The API's /catalog answers only the mirror job (MIRROR_SECRET), so for
  // local development run scripts/mirror_api.py with `--out site`.
  readDataBase() {
    return '';
  }

  dataUrl(path) {
    return this.dataBase + path;
  }

  // Cross-origin links ignore the `download` attribute; the API sends the
  // attachment header itself when asked
  downloadUrl(url) {
    return this.dataBase ? `${url}?download` : url;
  }

  loadSort() {
    let sort = null;
    try {
      sort = localStorage.getItem('lilka-sort');
    } catch (e) {
      sort = null;
    }
    return SORTS.includes(sort) ? sort : DEFAULT_SORT;
  }

  setSort(sort) {
    if (!SORTS.includes(sort) || sort === this.sort) return;
    this.sort = sort;
    try {
      localStorage.setItem('lilka-sort', sort);
    } catch (e) {
      // the choice then lasts for this visit only
    }
    document.getElementById('sortSelect').value = sort;
  }

  loadSortReverse() {
    try {
      return localStorage.getItem('lilka-sort-reverse') === '1';
    } catch (e) {
      return false;
    }
  }

  setSortReverse(reverse) {
    this.sortReverse = reverse;
    try {
      localStorage.setItem('lilka-sort-reverse', reverse ? '1' : '0');
    } catch (e) {
      // the choice then lasts for this visit only
    }
    this.updateSortReverseButton();
  }

  updateSortReverseButton() {
    const button = document.getElementById('sortReverse');
    button.textContent = this.sortReverse ? '↑' : '↓';
    button.setAttribute('aria-pressed', String(this.sortReverse));
  }

  // listing.json (one per kind, written by the mirror) has what the list
  // shows and sorts by. Null when a mirror without it is served.
  async loadListing(type) {
    if (!(type in this.listings)) {
      try {
        const response = await fetch(this.dataUrl(`${type}/listing.json`));
        this.listings[type] = response.ok ? (await response.json()).items : null;
      } catch (e) {
        this.listings[type] = null;
      }
    }
    return this.listings[type];
  }

  sortItems(items) {
    const name = (e) => String(this.localized(e, 'name') || e.path);
    const collator = new Intl.Collator(this.currentLang, {sensitivity: 'base'});
    const byName = (a, b) => collator.compare(name(a), name(b));
    // Dates are `YYYY-MM-DD HH:MM:SS` UTC, so text order is time order
    const byDate = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || '')) || byName(a, b);
    const compare = {
      newest: byDate('added'),
      updated: byDate('updated'),
      name: byName,
      author: (a, b) => collator.compare(String(a.author || ''), String(b.author || '')) || byName(a, b),
    }[this.sort] || byName;
    return [...items].sort(this.sortReverse ? (a, b) => compare(b, a) : compare);
  }

  formatDate(value) {
    if (!value) return '';
    const date = new Date(`${String(value).replace(' ', 'T')}Z`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(this.currentLang === 'uk' ? 'uk-UA' : 'en-GB',
        {year: 'numeric', month: 'short', day: 'numeric'});
  }

  isCommunityView(type) {
    return !!this.community && this.community.handles(type);
  }

  init() {
    // Hides icons and screenshots that fail to load. One listener instead of
    // inline onerror attributes, which the Content-Security-Policy forbids;
    // `error` does not bubble, hence the capture phase
    document.addEventListener('error', (e) => {
      if (e.target instanceof HTMLImageElement && e.target.hasAttribute('data-hide-broken')) {
        e.target.style.display = 'none';
      }
    }, true);
    this.setupEventListeners();
    this.setupLightboxListeners();
    this.updateLangSwitcher();
    this.handleRouting();
  }

  async handleRouting() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const page = params.get('page');
    const item = params.get('item');
    if (SORTS.includes(params.get('sort'))) this.setSort(params.get('sort'));
    if (params.has('reverse')) this.setSortReverse(params.get('reverse') === '1');

    if (this.isCommunityView(type)) {
      await this.community.show(type, params);
      return;
    }

    // Handle direct item link: ?type=apps&item=ble.app
    if (item && type) {
      this.currentType = type;
      this.showView(type);
      // Load the page list in background first
      await this.loadPage();
      // Then open the modal
      await this.openDirectItem(type, item);
      return;
    }

    // Handle authors page
    if (type === 'authors') {
      this.currentType = type;
      this.authorId = params.get('author') || null;
      await this.showAuthors({push: false});
      return;
    }

    // Handle page navigation: ?type=apps&page=1. Anything else, such as
    // links to the removed docs and examples tabs, opens the apps list.
    if (['apps', 'wallpapers', 'mods'].includes(type)) {
      this.currentType = type;
      this.currentPage = parseInt(page, 10) || 0;
      await this.switchType(type);
      return;
    }

    // Default: load apps page 0
    await this.loadPage();
  }

  // Highlight the tab button for `type` and toggle the main containers
  // (list content, loading, error, authors, community).
  showView(type) {
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    const community = this.isCommunityView(type);
    const isList = !community && type !== 'authors';
    document.getElementById('content').style.display =
        isList ? 'block' : 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('authors').style.display =
        type === 'authors' ? 'block' : 'none';
    document.getElementById('community').style.display =
        community ? 'block' : 'none';
  }

  async openDirectItem(type, itemName) {
    try {
      const manifestPath = `${type}/${itemName}/index.json`;
      const response = await fetch(this.dataUrl(manifestPath));

      if (!response.ok) {
        throw new Error(`Item not found: ${itemName}`);
      }

      const manifest = await response.json();
      this.showModal(manifest, itemName);
    } catch (error) {
      console.error('Error opening direct item:', error);
      this.showError(`Failed to load ${type.slice(0, -1)}: ${itemName}`);
    }
  }

  updateURL(type = null, page = null, itemName = null) {
    const params = new URLSearchParams();

    if (itemName) {
      // Direct item link: ?type=apps&item=ble.app
      params.set('type', type);
      params.set('item', itemName);
    } else if (type) {
      // Page navigation: ?type=apps&page=1&sort=name&reverse=1
      params.set('type', type);
      if (page !== null && page > 0) {
        params.set('page', page);
      }
      if (this.sort !== DEFAULT_SORT && ['apps', 'wallpapers', 'mods'].includes(type)) {
        params.set('sort', this.sort);
      }
      if (this.sortReverse && ['apps', 'wallpapers', 'mods'].includes(type)) {
        params.set('reverse', '1');
      }
    }

    const url = params.toString() ? `?${params.toString()}` : '/';
    window.history.pushState({type, page, itemName}, '', url);
  }

  setupLightboxListeners() {
    const lightbox = document.getElementById('lightbox');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxPrev = document.getElementById('lightboxPrev');
    const lightboxNext = document.getElementById('lightboxNext');

    lightboxClose.addEventListener('click', () => this.closeLightbox());
    lightboxPrev.addEventListener('click', () => this.prevLightboxImage());
    lightboxNext.addEventListener('click', () => this.nextLightboxImage());

    // Close on background click
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        this.closeLightbox();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (lightbox.style.display === 'flex') {
        if (e.key === 'Escape') this.closeLightbox();
        if (e.key === 'ArrowLeft') this.prevLightboxImage();
        if (e.key === 'ArrowRight') this.nextLightboxImage();
      }
    });
  }

  setupEventListeners() {
    // Language switcher
    document.querySelectorAll('.lang-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const lang = e.currentTarget.dataset.lang;
        if (window.umami) {
          window.umami.track('language-switch', {lang});
        }
        this.setLanguage(lang);
      });
    });

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        // Track tab clicks
        if (window.umami) {
          window.umami.track('tab-navigation', {tab: type});
        }
        if (this.isCommunityView(type)) {
          this.community.show(type);
        } else if (type === 'authors') {
          this.authorId = null;
          this.showAuthors();
        } else {
          this.switchType(type);
        }
      });
    });

    // Pagination (top & bottom)
    // Sorting is done on the page: listing.json holds every item of the tab
    const sortSelect = document.getElementById('sortSelect');
    sortSelect.value = this.sort;
    sortSelect.addEventListener('change', () => {
      this.setSort(sortSelect.value);
      if (window.umami) window.umami.track('sort', {sort: this.sort});
      this.currentPage = 0;
      this.loadPage();
    });
    const sortReverse = document.getElementById('sortReverse');
    this.updateSortReverseButton();
    sortReverse.addEventListener('click', () => {
      this.setSortReverse(!this.sortReverse);
      if (window.umami) window.umami.track('sort', {sort: this.sort, reverse: this.sortReverse});
      this.currentPage = 0;
      this.loadPage();
    });

    for (const id of ['prevPage', 'prevPageBottom']) {
      document.getElementById(id).addEventListener('click', () => {
        if (this.currentPage > 0) {
          this.currentPage--;
          this.loadPage();
        }
      });
    }

    for (const id of ['nextPage', 'nextPageBottom']) {
      document.getElementById(id).addEventListener('click', () => {
        if (this.currentPage < this.totalPages - 1) {
          this.currentPage++;
          this.loadPage();
        }
      });
    }

    // Modal
    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close');

    closeBtn.addEventListener('click', () => this.closeModal());

    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });

    // Close modal with ESC key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'block') {
        this.closeModal();
      }
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      modal.style.display = 'none';
      this._currentManifest = null;
      this._currentManifestName = null;
      this.handleRouting();
    });
  }

  closeModal() {
    document.getElementById('modal').style.display = 'none';
    this._currentManifest = null;
    this._currentManifestName = null;
    // Return to list view URL; on the Authors page, to the author
    if (this.currentType === 'authors') {
      const params = new URLSearchParams({type: 'authors'});
      if (this.authorId) params.set('author', this.authorId);
      if (location.search !== `?${params}`) {
        window.history.pushState({type: 'authors', author: this.authorId}, '', `?${params}`);
      }
      return;
    }
    this.updateURL(this.currentType, this.currentPage);
  }

  async switchType(type) {
    this.currentType = type;
    const params = new URLSearchParams(window.location.search);
    if (params.get('type') !== type) {
      this.currentPage = 0;
    }

    this.showView(type);

    await this.loadPage();
    window.scrollTo({top: 0});
  }

  ui(key, vars = {}) {
    const strings = UI_STRINGS[this.currentLang] || UI_STRINGS[this.defaultLanguage];
    return String(strings[key] ?? key).replace(/\{(\w+)\}/g, (m, name) =>
        name in vars ? String(vars[name]) : m);
  }

  /**
   * authors_info.json: one entry per person, with profile and stats. A
   * mirror built before it existed only has authors.json (author line ->
   * items), which is turned into the same shape without profiles.
   */
  async loadAuthors() {
    if (this.authorsData) return this.authorsData;
    const info = await fetch(this.dataUrl('authors_info.json'));
    if (info.ok) {
      this.authorsData = (await info.json()).authors || [];
      return this.authorsData;
    }
    const response = await fetch(this.dataUrl('authors.json'));
    if (!response.ok) throw new Error(`authors.json: ${response.status}`);
    const old = await response.json();
    this.authorsData = Object.entries(old).map(([line, items]) => {
      const login = (/^@([A-Za-z0-9-]+)$/.exec(line) || [])[1] || null;
      const counts = {apps: 0, wallpapers: 0, mods: 0};
      items.forEach(item => { counts[item.type] = (counts[item.type] || 0) + 1; });
      return {
        id: login ? login.toLowerCase() : this.authorSlug(line),
        name: login || line, login,
        github: login ? `https://github.com/${login}` : null,
        avatar: login ? `https://github.com/${login}.png?size=160` : null,
        aliases: [line], counts, items, registered: false,
      };
    });
    return this.authorsData;
  }

  /** An author by id, or by the author line an item card links with. */
  findAuthor(authors, key) {
    const wanted = String(key || '').toLowerCase();
    return authors.find(a => a.id === wanted ||
        (a.aliases || []).some(alias => alias.toLowerCase() === wanted)) || null;
  }

  async showAuthors({push = true} = {}) {
    this.currentType = 'authors';
    this.showView('authors');
    const box = document.getElementById('authors');
    if (push) {
      const params = new URLSearchParams({type: 'authors'});
      if (this.authorId) params.set('author', this.authorId);
      if (location.search !== `?${params}`) {
        window.history.pushState({type: 'authors', author: this.authorId}, '', `?${params}`);
      }
    }
    if (!this.authorsData) {
      box.innerHTML = `<div class="loading">${this.escapeHtml(this.ui('loading'))}</div>`;
    }
    try {
      const authors = await this.loadAuthors();
      if (this.authorId) {
        this.renderAuthorPage(box, authors);
      } else {
        this.renderAuthorsGrid(box, authors);
      }
    } catch (error) {
      box.innerHTML = `<p class="authors-error">${
          this.escapeHtml(this.ui('authors-error', {message: error.message}))}</p>`;
    }
  }

  openAuthor(id) {
    this.authorId = id;
    this.showAuthors();
    window.scrollTo({top: 0});
  }

  /** Only http(s) links from the data reach an href. */
  safeUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
  }

  authorHandle(a) {
    return a.handle || (a.login ? `@${a.login}` : '');
  }

  renderAvatar(author, size) {
    const initial = ((author.name || '').match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
    // The initial stays underneath; a broken image hides itself
    return `<span class="author-avatar author-avatar-${size}" aria-hidden="true">
        <span>${this.escapeHtml(initial)}</span>
        ${this.safeUrl(author.avatar) ? `<img src="${this.escapeHtml(author.avatar)}" alt="" loading="lazy"
            referrerpolicy="no-referrer" data-hide-broken>` : ''}
      </span>`;
  }

  renderAuthorCounts(counts) {
    return ['apps', 'wallpapers', 'mods'].filter(kind => counts[kind]).map(kind =>
        `<span class="author-count type-${kind}">${this.escapeHtml(this.ui(`kind-${kind}`))} <b>${
            counts[kind]}</b></span>`).join('');
  }

  totalItems(author) {
    const c = author.counts || {};
    return (c.apps || 0) + (c.wallpapers || 0) + (c.mods || 0);
  }

  renderAuthorsGrid(box, authors) {
    this.authorsSort = this.authorsSort || 'items';
    this.authorsKind = this.authorsKind || 'all';
    const sorts = ['items', 'recent', 'name', 'newest'];
    const kinds = ['all', 'apps', 'wallpapers', 'mods'];
    const total = authors.reduce((n, a) => n + this.totalItems(a), 0);
    box.innerHTML = `
      <div class="authors-head">
        <div>
          <h2 class="authors-title">${this.escapeHtml(this.ui('authors-title'))}</h2>
          <p class="authors-summary">${this.escapeHtml(this.ui('authors-summary', {authors: authors.length, items: total}))}</p>
        </div>
      </div>
      <div class="authors-toolbar">
        <input type="search" class="authors-search" value="${this.escapeHtml(this.authorsQuery || '')}"
            placeholder="${this.escapeHtml(this.ui('authors-search'))}" aria-label="${this.escapeHtml(this.ui('authors-search'))}">
        <div class="authors-kinds" role="group">
          ${kinds.map(kind => `<button type="button" class="authors-chip ${kind === this.authorsKind ? 'active' : ''}"
              data-kind="${kind}">${this.escapeHtml(this.ui(kind === 'all' ? 'authors-all' : `kind-${kind}`))}</button>`).join('')}
        </div>
        <select class="authors-sort" aria-label="${this.escapeHtml(this.ui('sort-label'))}">
          ${sorts.map(sort => `<option value="${sort}" ${sort === this.authorsSort ? 'selected' : ''}>${
              this.escapeHtml(this.ui(`authors-sort-${sort}`))}</option>`).join('')}
        </select>
      </div>
      <div class="authors-grid"></div>`;

    const grid = box.querySelector('.authors-grid');
    const draw = () => {
      const q = (this.authorsQuery || '').trim().toLowerCase();
      const collator = new Intl.Collator(this.currentLang, {sensitivity: 'base'});
      const byName = (a, b) => collator.compare(a.name, b.name);
      const compare = {
        items: (a, b) => this.totalItems(b) - this.totalItems(a) || byName(a, b),
        recent: (a, b) => String(b.last_updated || '').localeCompare(String(a.last_updated || '')) || byName(a, b),
        newest: (a, b) => String(b.first_added || '').localeCompare(String(a.first_added || '')) || byName(a, b),
        name: byName,
      }[this.authorsSort];
      const shown = authors.filter(a => {
        if (this.authorsKind !== 'all' && !(a.counts || {})[this.authorsKind]) return false;
        if (!q) return true;
        const haystack = [a.name, a.login, a.bio, ...(a.aliases || []),
          ...a.items.map(i => this.localized(i, 'name'))].join(' ').toLowerCase();
        return haystack.includes(q);
      }).sort(compare);
      grid.innerHTML = shown.length ? shown.map(a => this.renderAuthorCard(a)).join('') :
          `<p class="authors-empty">${this.escapeHtml(this.ui('authors-empty'))}</p>`;
      grid.querySelectorAll('.author-card').forEach(card => {
        card.addEventListener('click', (e) => {
          // The GitHub link opens GitHub; a modified click opens a new tab
          if (e.target.closest('.author-card-ext')) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          this.openAuthor(card.dataset.author);
        });
      });
    };
    draw();

    const search = box.querySelector('.authors-search');
    search.addEventListener('input', () => {
      this.authorsQuery = search.value;
      draw();
    });
    box.querySelectorAll('.authors-chip').forEach(chip => chip.addEventListener('click', () => {
      this.authorsKind = chip.dataset.kind;
      box.querySelectorAll('.authors-chip').forEach(c => c.classList.toggle('active', c === chip));
      draw();
    }));
    box.querySelector('.authors-sort').addEventListener('change', (e) => {
      this.authorsSort = e.target.value;
      draw();
    });
  }

  renderAuthorCard(a) {
    const href = `?type=authors&author=${encodeURIComponent(a.id)}`;
    const active = this.formatDate(a.last_updated);
    // The whole card opens the author; the title is the real link, for the
    // keyboard and for opening in a new tab
    return `
      <div class="author-card" data-author="${this.escapeHtml(a.id)}">
        <div class="author-card-top">
          ${this.renderAvatar(a, 'md')}
          <div class="author-card-names">
            <h3><a class="author-card-link" href="${this.escapeHtml(href)}">${this.escapeHtml(a.name)}</a>${a.registered ?
                ` <span class="author-verified" title="${this.escapeHtml(this.ui('author-verified-hint'))}">✓</span>` : ''}</h3>
            ${this.authorHandle(a) ? `<span class="author-login">${this.escapeHtml(this.authorHandle(a))}</span>` : ''}
          </div>
        </div>
        ${a.bio ? `<p class="author-card-bio">${this.escapeHtml(a.bio)}</p>` : ''}
        <div class="author-counts">${this.renderAuthorCounts(a.counts || {})}</div>
        <div class="author-card-foot">
          <span>${active ? this.escapeHtml(this.ui('author-active', {date: active})) : ''}</span>
          ${this.safeUrl(a.github) ? `<a class="author-card-ext" href="${this.escapeHtml(a.github)}" target="_blank"
              rel="noopener noreferrer" title="${this.escapeHtml(this.ui('author-github'))}">GitHub ↗</a>` : ''}
          ${this.safeUrl(a.printables) ? `<a class="author-card-ext" href="${this.escapeHtml(a.printables)}" target="_blank"
              rel="noopener noreferrer" title="${this.escapeHtml(this.ui('author-printables'))}">Printables ↗</a>` : ''}
        </div>
      </div>`;
  }

  renderAuthorPage(box, authors) {
    const a = this.findAuthor(authors, this.authorId);
    const back = `<button type="button" class="author-back">← ${this.escapeHtml(this.ui('author-back'))}</button>`;
    if (!a) {
      box.innerHTML = `${back}<p class="authors-empty">${
          this.escapeHtml(this.ui('author-not-found', {name: this.authorId}))}</p>`;
      box.querySelector('.author-back').addEventListener('click', () => this.openAuthor(null));
      return;
    }
    // A link by author line becomes the canonical one
    if (a.id !== this.authorId) {
      this.authorId = a.id;
      window.history.replaceState({type: 'authors', author: a.id}, '',
          `?type=authors&author=${encodeURIComponent(a.id)}`);
    }
    this.authorItemsKind = this.authorItemsKind && (a.counts || {})[this.authorItemsKind] ? this.authorItemsKind : 'all';

    const facts = [];
    if (a.location) facts.push(`<span class="author-fact">📍 ${this.escapeHtml(a.location)}</span>`);
    if (a.company) facts.push(`<span class="author-fact">🏢 ${this.escapeHtml(a.company)}</span>`);
    if (this.safeUrl(a.blog)) {
      const shown = a.blog.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      facts.push(`<a class="author-fact" href="${this.escapeHtml(a.blog)}" target="_blank" rel="noopener noreferrer nofollow ugc">🔗 ${
          this.escapeHtml(shown)}</a>`);
    }
    const first = this.formatDate(a.first_added);
    const last = this.formatDate(a.last_updated);
    const kinds = ['all', ...['apps', 'wallpapers', 'mods'].filter(k => (a.counts || {})[k])];

    box.innerHTML = `
      ${back}
      <section class="author-profile">
        ${this.renderAvatar(a, 'lg')}
        <div class="author-profile-main">
          <h2>${this.escapeHtml(a.name)}</h2>
          <div class="author-profile-sub">
            ${this.authorHandle(a) ? `<span class="author-login">${this.escapeHtml(this.authorHandle(a))}</span>` : ''}
            ${a.registered ? `<span class="author-badge" title="${this.escapeHtml(this.ui('author-verified-hint'))}">✓ ${
                this.escapeHtml(this.ui('author-verified'))}</span>` : ''}
          </div>
          ${a.bio ? `<p class="author-profile-bio">${this.escapeHtml(a.bio)}</p>` : ''}
          ${facts.length ? `<div class="author-facts">${facts.join('')}</div>` : ''}
          <div class="author-counts">${this.renderAuthorCounts(a.counts || {})}</div>
          <div class="author-dates">
            ${first ? `<span>${this.escapeHtml(this.ui('author-first', {date: first}))}</span>` : ''}
            ${last ? `<span>${this.escapeHtml(this.ui('author-last', {date: last}))}</span>` : ''}
          </div>
          <div class="author-profile-actions">
            ${this.safeUrl(a.github) ? `<a class="btn-sm" href="${this.escapeHtml(a.github)}" target="_blank" rel="noopener noreferrer">${
                this.escapeHtml(this.ui('author-github'))} ↗</a>` : ''}
            ${this.safeUrl(a.printables) ? `<a class="btn-sm" href="${this.escapeHtml(a.printables)}" target="_blank" rel="noopener noreferrer">${
                this.escapeHtml(this.ui('author-printables'))} ↗</a>` : ''}
            <button type="button" class="btn-sm author-copy">${this.escapeHtml(this.ui('author-copy'))}</button>
          </div>
        </div>
      </section>
      <div class="author-items-head">
        <h3>${this.escapeHtml(this.ui('author-items'))}</h3>
        ${kinds.length > 2 ? `<div class="authors-kinds" role="group">${kinds.map(kind =>
            `<button type="button" class="authors-chip ${kind === this.authorItemsKind ? 'active' : ''}" data-kind="${kind}">${
                this.escapeHtml(this.ui(kind === 'all' ? 'authors-all' : `kind-${kind}`))}</button>`).join('')}</div>` : ''}
      </div>
      <div class="author-items-grid"></div>`;

    const grid = box.querySelector('.author-items-grid');
    const draw = () => {
      const items = a.items.filter(i => this.authorItemsKind === 'all' || i.type === this.authorItemsKind);
      grid.innerHTML = items.map(item => this.renderAuthorItem(item)).join('');
      grid.querySelectorAll('.author-item-card').forEach(card => {
        const open = () => this.openAuthorItem(card.dataset.itemType, card.dataset.itemPath);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        });
      });
    };
    draw();

    box.querySelector('.author-back').addEventListener('click', () => this.openAuthor(null));
    box.querySelectorAll('.authors-chip').forEach(chip => chip.addEventListener('click', () => {
      this.authorItemsKind = chip.dataset.kind;
      box.querySelectorAll('.authors-chip').forEach(c => c.classList.toggle('active', c === chip));
      draw();
    }));
    const copy = box.querySelector('.author-copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        copy.textContent = this.ui('author-copied');
        setTimeout(() => { copy.textContent = this.ui('author-copy'); }, 1500);
      } catch (e) {
        prompt(this.ui('author-copy'), location.href);
      }
    });
  }

  renderAuthorItem(item) {
    const name = this.localized(item, 'name') || item.path;
    const short = this.localized(item, 'short_description') || '';
    const icon = item.icon ? this.dataUrl(`${item.type}/${item.path}/static/${item.icon}`) : '';
    const updated = this.formatDate(item.updated);
    return `
      <div class="author-item-card" role="button" tabindex="0" data-item-type="${this.escapeHtml(item.type)}"
          data-item-path="${this.escapeHtml(item.path)}">
        ${icon ? `<img src="${this.escapeHtml(icon)}" alt="${this.escapeHtml(name)}" class="icon" loading="lazy" data-hide-broken>` : ''}
        <h3>${this.escapeHtml(name)}</h3>
        <span class="author-item-type type-${this.escapeHtml(item.type)}">${this.escapeHtml(this.ui(`kind-one-${item.type}`))}</span>
        <div class="short-desc">${this.escapeHtml(short)}</div>
        ${updated ? `<div class="card-meta"><span class="card-date">${
            this.escapeHtml(this.ui('card-updated', {date: updated}))}</span></div>` : ''}
      </div>`;
  }

  async openAuthorItem(type, path) {
    try {
      const response = await fetch(this.dataUrl(`${type}/${path}/index.json`));
      if (!response.ok) throw new Error(`Item not found: ${path}`);
      const manifest = await response.json();
      this.showModal(manifest, path, type);
    } catch (err) {
      console.error('Error opening item from authors:', err);
    }
  }

  async loadPage() {
    // Community views render themselves
    if (this.isCommunityView(this.currentType)) {
      return;
    }

    this.showLoading(true);
    this.hideError();

    try {
      const listing = await this.loadListing(this.currentType);
      // Without listing.json only the fixed pages exist, sorted by id: a
      // selector that cannot change anything would only look broken
      document.querySelector('.list-toolbar').hidden = !listing;
      if (listing) {
        const sorted = this.sortItems(listing);
        this.totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
        if (this.currentPage >= this.totalPages) this.currentPage = 0;
        const items = document.getElementById('items');
        items.innerHTML = '';
        sorted.slice(this.currentPage * PAGE_SIZE, (this.currentPage + 1) * PAGE_SIZE)
            .forEach(entry => items.appendChild(this.createItemCard(entry, entry.path)));
        this.updatePagination();
        this.updateURL(this.currentType, this.currentPage);
        return;
      }

      // Mirror without listing.json: the old index pages, sorted by id
      const indexPath = `${this.currentType}/index_${this.currentPage}.json`;
      const response = await fetch(this.dataUrl(indexPath));

      if (!response.ok) {
        throw new Error(`Failed to load ${indexPath}: ${response.status}`);
      }

      const data = await response.json();
      this.totalPages = data.total_pages;
      this.manifests = data.manifests.filter(m => m && m.trim());

      await this.loadManifests();
      this.updatePagination();

      // Update URL when page loads
      this.updateURL(this.currentType, this.currentPage);
    } catch (error) {
      this.showError(`Error loading page: ${error.message}`);
      console.error(error);
    } finally {
      this.showLoading(false);
    }
  }

  async loadManifests() {
    const itemsContainer = document.getElementById('items');
    itemsContainer.innerHTML = '';

    // Fetch all manifests in parallel, then render in original order
    const manifests = await Promise.all(this.manifests.map(async (name) => {
      const manifestPath = `${this.currentType}/${name}/index.json`;
      try {
        const response = await fetch(this.dataUrl(manifestPath));
        if (!response.ok) {
          console.warn(`Failed to load ${manifestPath}`);
          return null;
        }
        return await response.json();
      } catch (error) {
        console.error(`Error loading manifest ${name}:`, error);
        return null;
      }
    }));

    manifests.forEach((manifest, i) => {
      if (manifest) {
        itemsContainer.appendChild(
            this.createItemCard(manifest, this.manifests[i]));
      }
    });
  }

  createItemCard(manifest, manifestName) {
    const card = document.createElement('div');
    card.className = 'item-card';

    // Build icon path without duplicating type
    const iconPath =
        this.dataUrl(`${this.currentType}/${manifestName}/static/${manifest.icon}`);

    const cardName = this.localized(manifest, 'name');
    const cardShortDesc = this.localized(manifest, 'short_description') || '';
    card.innerHTML = `
            ${
        manifest.icon ?
            `<img src="${iconPath}" alt="${
                this.escapeHtml(
                    cardName)}" class="icon" data-hide-broken>` :
            ''}
            <h3>${this.escapeHtml(cardName)}</h3>
            <div class="author"><a href="?type=authors&author=${
        encodeURIComponent(
            manifest.author)}" class="author-link" data-author="${
        this.escapeHtml(
            manifest.author)}">${this.escapeHtml(manifest.author)}</a></div>
            <div class="short-desc">${this.escapeHtml(cardShortDesc)}</div>
            ${this.renderCardMeta(manifest)}
        `;

    // Author link click — navigate to authors page
    const authorLink = card.querySelector('.author-link');
    if (authorLink) {
      authorLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.navigateToAuthor(manifest.author);
      });
    }

    card.addEventListener('click', () => {
      // Track card clicks to view details
      if (window.umami) {
        window.umami.track(
            'view-details',
            {type: this.currentType, name: manifest.name, item: manifestName});
      }
      // A listing entry is a summary; the details come from index.json
      if (manifest.path !== undefined) {
        this.openDirectItem(this.currentType, manifestName);
      } else {
        this.showModal(manifest, manifestName);
      }
      // Update URL when opening modal
      this.updateURL(this.currentType, null, manifestName);
    });

    return card;
  }

  // Last update, from listing.json; manifests have none
  renderCardMeta(entry) {
    const parts = [];
    // The date the list is sorted by; "updated" otherwise
    const key = this.sort === 'newest' ? 'added' : 'updated';
    const date = this.formatDate(entry[key]);
    if (date) {
      const strings = UI_STRINGS[this.currentLang] || UI_STRINGS[this.defaultLanguage];
      parts.push(`<span class="card-date">${
          this.escapeHtml(strings[`card-${key}`].replace('{date}', date))}</span>`);
    }
    return parts.length ? `<div class="card-meta">${parts.join('')}</div>` : '';
  }

  // --- Modal section renderers -------------------------------------------

  renderFileItem(file, basePath, itemName, event, itemAttr) {
    if (!file || !file.location) return '';
    return `
      <div class="file-item">
        <p><strong>${this.escapeHtml(file.type || 'Unknown')}:</strong> ${
        this.escapeHtml(file.location)}</p>
        <a href="${this.downloadUrl(`${basePath}/static/${
        file.location}`)}" download class="download-btn-small" data-umami-event="${
        event}" data-umami-event-${itemAttr}="${
        this.escapeHtml(itemName)}" data-umami-event-type="${
        this.escapeHtml(file.type)}">⬇️ Download</a>
      </div>`;
  }

  renderFilesSection(manifest, basePath) {
    let html = '';
    // Analytics attribute for the item kind: 'app', 'wallpaper' or 'mod'
    const itemAttr = this.currentType.slice(0, -1);

    if (['apps', 'wallpapers'].includes(this.currentType) &&
        manifest.entryfile &&
        manifest.entryfile.location) {
      const entryFile = manifest.entryfile;
      html += `
        <div class="modal-section">
          <h3>📦 Entry File</h3>
          <p><strong>Type:</strong> ${
          this.escapeHtml(entryFile.type || 'N/A')}</p>
          <p><strong>File:</strong> ${this.escapeHtml(entryFile.location)}</p>
          <a href="${this.downloadUrl(`${basePath}/static/${
          entryFile.location}`)}" download class="download-btn" data-umami-event="download-entry-file" data-umami-event-${
          itemAttr}="${
          this.escapeHtml(manifest.name)}">⬇️ Download Entry File</a>
        </div>`;
    }

    if (Array.isArray(manifest.files) && manifest.files.length > 0) {
      html += `
        <div class="modal-section">
          <h3>📁 Additional Files</h3>
          ${
          manifest.files
              .map(
                  f => this.renderFileItem(
                      f, basePath, manifest.name, 'download-additional-file',
                      itemAttr))
              .join('')}
        </div>`;
    }

    if (this.currentType === 'mods' && Array.isArray(manifest.modfiles)) {
      html += `
        <div class="modal-section">
          <h3>📦 Mod Files</h3>
          ${
          manifest.modfiles
              .map(
                  f => this.renderFileItem(
                      f, basePath, manifest.name, 'download-mod-file', 'mod'))
              .join('')}
        </div>`;
    }

    if (manifest.package) {
      html += `
        <div class="modal-section">
          <h3>📦 Package ZIP</h3>
          <p><strong>File:</strong> ${this.escapeHtml(manifest.package)}</p>
          <a href="${this.downloadUrl(`${basePath}/${
          manifest.package}`)}" download class="download-btn" data-umami-event="download-package-zip" data-umami-event-item="${
          this.escapeHtml(manifest.name)}" data-umami-event-category="${
          this.currentType}">⬇️ Download ZIP</a>
        </div>`;
    }

    return html;
  }

  renderSecurityFile(f) {
    let avBadge = '';
    if (f.av_scan) {
      const cls = f.av_scan.status === 'clean' ? 'security-clean' :
          f.av_scan.status === 'infected'      ? 'security-infected' :
                                                 'security-noav';
      const label = f.av_scan.status === 'clean' ?
          '✅ Clean' :
          (f.av_scan.status === 'infected' ? '❌ ' : '') +
              this.escapeHtml(f.av_scan.detail);
      avBadge = `<span class="security-badge-sm ${cls}">${label}</span>`;
    }

    const hashRow = (label, hash, display) => `
      <span class="security-hash" title="${label} checksum">
        🔑 ${label}: <code>${hash ? display : 'N/A'}</code>
        ${
        hash ? `<button class="copy-hash-btn" data-hash="${hash}" title="Copy ${
                   label}">📋</button>` :
               ''}
      </span>`;

    return `
      <div class="security-file-item">
        <div class="security-file-name">
          <strong>${this.escapeHtml(f.file)}</strong>
          ${avBadge}
        </div>
        <div class="security-file-details">
          ${
        hashRow(
            'SHA-256', f.sha256,
            f.sha256 ? f.sha256.substring(0, 16) + '…' : '')}
          ${hashRow('MD5', f.md5, f.md5)}
          <span class="security-size">${
        f.size ? (f.size / 1024).toFixed(1) + ' KB' : ''}</span>
        </div>
      </div>`;
  }

  renderSecuritySection(manifest) {
    const sec = manifest.security;
    if (!sec || !sec.files || sec.files.length === 0) return '';

    const scanDate =
        sec.scan_date ? new Date(sec.scan_date).toLocaleString() : 'N/A';
    const hasAvScan = sec.clamav_available && sec.files.some(f => f.av_scan);
    const allClean =
        sec.files.every(f => !f.av_scan || f.av_scan.status === 'clean');

    const overallBadge = !hasAvScan ?
        '<span class="security-badge security-noav">🔒 Checksums only</span>' :
        allClean ?
        '<span class="security-badge security-clean">✅ All files clean</span>' :
        '<span class="security-badge security-infected">⚠️ Threats detected</span>';

    const t = UI_STRINGS[this.currentLang] || UI_STRINGS[this.defaultLanguage];
    const infoBtn = hasAvScan ?
        `<button type="button" class="security-info-btn" aria-expanded="false"
            aria-controls="securityInfo" title="${t['av-info-title']}"
            aria-label="${t['av-info-title']}">!</button>` :
        '';
    const infoPanel = hasAvScan ? `
        <div class="security-info" id="securityInfo" hidden>
          <strong>${t['av-info-title']}</strong>
          <ul>
            ${[1, 2, 3, 4, 5].map(i => `<li>${t['av-info-' + i]}</li>`).join('')}
          </ul>
        </div>` :
                                  '';

    return `
      <div class="modal-section security-section">
        <h3>🛡️ Security</h3>
        <div class="security-header">
          <span class="security-status">${overallBadge}${infoBtn}</span>
          <span class="security-date">Scanned: ${
        this.escapeHtml(scanDate)}</span>
        </div>${infoPanel}
        <div class="security-files">
          ${sec.files.map(f => this.renderSecurityFile(f)).join('')}
        </div>
      </div>`;
  }

  renderSourcesSection(manifest) {
    const sources = manifest.sources;
    if (!sources) return '';
    const origin = sources.location && sources.location.origin;
    return `
      <div class="modal-section">
        <h3>🔗 Sources</h3>
        <p><strong>Type:</strong> ${this.escapeHtml(sources.type || 'N/A')}</p>
        ${
        origin ?
            `<p><strong>Repository:</strong> <a href="${
                this.escapeHtml(
                    origin)}" target="_blank" style="color: var(--primary-color);">${
                this.escapeHtml(origin)}</a></p>` :
            ''}
      </div>`;
  }

  renderScreenshotsSection(manifest, basePath) {
    if (!Array.isArray(manifest.screenshots) ||
        manifest.screenshots.length === 0) {
      return '';
    }
    return `
      <div class="modal-section">
        <h3>📷 Screenshots</h3>
        <div class="screenshots-gallery">
          ${
        manifest.screenshots
            .map(
                (s, index) => `<img src="${basePath}/static/${
                    s}" alt="Screenshot" class="screenshot-thumb" data-index="${
                    index}" data-hide-broken>`)
            .join('')}
        </div>
      </div>`;
  }

  renderMarkdownSection(title, text) {
    if (!text || !text.trim()) return '';
    return `
      <div class="modal-section">
        <h3>${title}</h3>
        <div class="markdown-content">${this.renderMarkdown(text)}</div>
      </div>`;
  }

  showModal(manifest, manifestName, type = this.currentType) {
    // Remember the currently open manifest so it can be re-rendered when the
    // language is switched while the modal is open. The kind is passed in from
    // the Authors page, where the list behind the modal is not of one kind
    this._currentManifest = manifest;
    this._currentManifestName = manifestName;
    this._currentManifestType = type;

    const modalName = this.localized(manifest, 'name');

    // Track manifest views
    if (window.umami) {
      window.umami.track('view-manifest', {
        type,
        name: manifest.name,
        manifest: manifestName,
        author: manifest.author
      });
    }

    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');

    // manifestName already includes the full path relative to type
    const basePath = this.dataUrl(`${type}/${manifestName}`);

    // Store screenshots for lightbox
    this.currentScreenshots =
        (manifest.screenshots || []).map(s => `${basePath}/static/${s}`);

    modalBody.innerHTML = `
        <div class="modal-header">
            <h2>${this.escapeHtml(modalName)}</h2>
            <div class="author"><a href="?type=authors&author=${
        encodeURIComponent(
            manifest.author)}" class="author-link" data-author="${
        this.escapeHtml(
            manifest.author)}">${this.escapeHtml(manifest.author)}</a></div>
        </div>
        ${
        manifest.icon ?
            `<img src="${basePath}/static/${manifest.icon}" alt="${
                this.escapeHtml(
                    modalName)}" class="modal-icon" data-hide-broken>` :
            ''}
        ${this.renderScreenshotsSection(manifest, basePath)}
        ${
        this.renderMarkdownSection(
            '📝 Description', this.localized(manifest, 'description'))}
        ${
        this.renderMarkdownSection(
            '📋 Changelog', this.localized(manifest, 'changelog'))}
        ${this.renderFilesSection(manifest, basePath)}
        ${this.renderSecuritySection(manifest)}
        ${this.renderSourcesSection(manifest)}
    `;

    modal.style.display = 'block';

    // Scroll modal content to top
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.scrollTop = 0;
    }

    // Screenshot thumbnails open the lightbox
    modalBody.querySelectorAll('.screenshot-thumb').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        this.openLightbox(parseInt(e.target.dataset.index, 10));
      });
    });

    // Author link navigates to the authors page
    const modalAuthorLink = modalBody.querySelector('.author-link');
    if (modalAuthorLink) {
      modalAuthorLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.navigateToAuthor(modalAuthorLink.dataset.author);
      });
    }

    // Antivirus info toggle
    const avInfoBtn = modalBody.querySelector('.security-info-btn');
    const avInfo = modalBody.querySelector('.security-info');
    if (avInfoBtn && avInfo) {
      avInfoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        avInfo.hidden = !avInfo.hidden;
        avInfoBtn.setAttribute('aria-expanded', String(!avInfo.hidden));
      });
    }

    // Copy-hash buttons
    modalBody.querySelectorAll('.copy-hash-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(btn.dataset.hash).then(() => {
          const original = btn.textContent;
          btn.textContent = '✓';
          setTimeout(() => btn.textContent = original, 1500);
        });
      });
    });
  }

  openLightbox(index) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');

    this.currentLightboxIndex = index;
    lightboxImg.src = this.currentScreenshots[index];
    lightbox.style.display = 'flex';

    this.updateLightboxButtons();
  }

  closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
  }

  nextLightboxImage() {
    if (this.currentLightboxIndex < this.currentScreenshots.length - 1) {
      this.currentLightboxIndex++;
      document.getElementById('lightboxImg').src =
          this.currentScreenshots[this.currentLightboxIndex];
      this.updateLightboxButtons();
    }
  }

  prevLightboxImage() {
    if (this.currentLightboxIndex > 0) {
      this.currentLightboxIndex--;
      document.getElementById('lightboxImg').src =
          this.currentScreenshots[this.currentLightboxIndex];
      this.updateLightboxButtons();
    }
  }

  updateLightboxButtons() {
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    const counter = document.getElementById('lightboxCounter');

    prevBtn.style.display = this.currentLightboxIndex > 0 ? 'block' : 'none';
    nextBtn.style.display =
        this.currentLightboxIndex < this.currentScreenshots.length - 1 ?
        'block' :
        'none';
    counter.textContent =
        `${this.currentLightboxIndex + 1} / ${this.currentScreenshots.length}`;
  }

  updatePagination() {
    // Update prev/next buttons
    const prevDisabled = this.currentPage === 0;
    const nextDisabled = this.currentPage >= this.totalPages - 1;

    document.getElementById('prevPage').disabled = prevDisabled;
    document.getElementById('prevPageBottom').disabled = prevDisabled;
    document.getElementById('nextPage').disabled = nextDisabled;
    document.getElementById('nextPageBottom').disabled = nextDisabled;

    // Render page numbers
    this.renderPageNumbers('pageNumbers');
    this.renderPageNumbers('pageNumbersBottom');
  }

  renderPageNumbers(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const maxButtons = 7;  // Maximum number of page buttons to show
    let startPage = Math.max(0, this.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(this.totalPages - 1, startPage + maxButtons - 1);

    // Adjust startPage if we're near the end
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(0, endPage - maxButtons + 1);
    }

    // First page
    if (startPage > 0) {
      container.appendChild(this.createPageButton(0));
      if (startPage > 1) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'page-ellipsis';
        ellipsis.textContent = '...';
        container.appendChild(ellipsis);
      }
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
      container.appendChild(this.createPageButton(i));
    }

    // Last page
    if (endPage < this.totalPages - 1) {
      if (endPage < this.totalPages - 2) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'page-ellipsis';
        ellipsis.textContent = '...';
        container.appendChild(ellipsis);
      }
      container.appendChild(this.createPageButton(this.totalPages - 1));
    }
  }

  createPageButton(pageIndex) {
    const button = document.createElement('button');
    button.className = 'page-btn';
    button.textContent = pageIndex + 1;

    if (pageIndex === this.currentPage) {
      button.classList.add('active');
    }

    button.addEventListener('click', () => {
      this.currentPage = pageIndex;
      this.loadPage();
    });

    return button;
  }

  showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('content').style.display = show ? 'none' : 'block';
  }

  showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  hideError() {
    document.getElementById('error').style.display = 'none';
  }

  // Also used inside attribute values (alt, title, data-*), so quotes are
  // escaped too: an app name like `x" onerror="...` must stay text
  escapeHtml(text) {
    if (text === null || text === undefined || text === '') return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
  }

  // Descriptions and changelogs are written by app authors; marked passes raw
  // HTML through, so its output is sanitized before it reaches the page
  renderMarkdown(text) {
    return DOMPurify.sanitize(marked.parse(text));
  }

  authorSlug(author) {
    return (author || '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  navigateToAuthor(author) {
    document.getElementById('modal').style.display = 'none';
    this._currentManifest = null;
    this._currentManifestName = null;
    this.openAuthor(author);
  }

}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LilkaRepository();
});
