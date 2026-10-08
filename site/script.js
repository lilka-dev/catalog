// Static UI strings per language, applied to elements with [data-i18n]
const UI_STRINGS = {
  uk: {
    'subtitle': 'Ігри, інструменти та модифікації для DIY-консолі Лілка',
    'tab-apps': 'Додатки',
    'tab-mods': 'Моди',
    'tab-authors': 'Автори',
    'tab-examples': 'Приклади',
    'tab-docs': 'Документація',
    'loading': 'Завантаження...',
    'av-info-title': 'Як ми перевіряємо файли',
    'av-info-1': 'Кожен файл для завантаження (включно з package.zip) перевіряється антивірусом ClamAV під час кожної збірки каталогу в GitHub Actions.',
    'av-info-2': 'Перед скануванням бази сигнатур оновлюються до найновіших (freshclam).',
    'av-info-3': 'Вміст архівів також сканується.',
    'av-info-4': 'Для кожного файлу публікуються контрольні суми SHA-256 та MD5 — порівняйте їх із завантаженим файлом, щоб переконатися, що його не змінено.',
    'av-info-5': 'Антивірус не дає 100% гарантії — завантажуйте лише ті застосунки, авторам яких довіряєте.',
  },
  en: {
    'subtitle': 'Games, tools, and modifications for the Lilka DIY console',
    'tab-apps': 'Apps',
    'tab-mods': 'Mods',
    'tab-authors': 'Authors',
    'tab-examples': 'Examples',
    'tab-docs': 'Documentation',
    'loading': 'Loading...',
    'av-info-title': 'How we check files',
    'av-info-1': 'Every downloadable file (including package.zip) is scanned with the ClamAV antivirus on each catalog build in GitHub Actions.',
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
  }

  // Re-render currently visible content using the selected language
  refreshLocalizedContent() {
    if (this.currentType === 'authors') {
      this.showAuthors();
    } else if (this.currentType === 'docs') {
      this.showDocumentation();
    } else if (this.currentType !== 'examples') {
      this.loadPage();
    }
    // If a modal is open, re-render it with the new language
    const modal = document.getElementById('modal');
    if (modal && modal.style.display === 'block' && this._currentManifest &&
        this._currentManifestName) {
      this.showModal(this._currentManifest, this._currentManifestName);
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

  init() {
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

    // Handle examples page
    if (type === 'examples') {
      this.currentType = type;
      this.showView('examples');
      const examplesContainer = document.getElementById('examples');

      const exPath = params.get('path') || '';
      this.examplesCurrentPath = exPath;

      // Only re-render browser skeleton if not already rendered
      if (!document.getElementById('examples-body')) {
        this.renderExamplesBrowser(examplesContainer);
      }

      // Determine if this is a file or directory
      if (exPath && this._examplesFileCache &&
          this._examplesFileCache[exPath]) {
        const cached = this._examplesFileCache[exPath];
        await this.viewExampleFile(exPath, cached.name, cached.download, true);
      } else {
        await this.loadExamplesDir(exPath, true);
      }
      window.scrollTo({top: 0});
      return;
    }

    // Handle docs page
    if (type === 'docs') {
      this.currentType = type;
      await this.showDocumentation();
      return;
    }

    // Handle authors page
    if (type === 'authors') {
      this.currentType = type;
      const authorParam = params.get('author');
      await this.showAuthors();
      if (authorParam) {
        const sectionId = `author-${this.authorSlug(authorParam)}`;
        const section = document.getElementById(sectionId);
        if (section) {
          section.classList.remove('collapsed');
          section.scrollIntoView({behavior: 'smooth', block: 'start'});
          section.classList.add('author-highlight');
          setTimeout(() => section.classList.remove('author-highlight'), 2000);
        }
      }
      return;
    }

    // Handle page navigation: ?type=apps&page=1
    if (type) {
      this.currentType = type;
      this.currentPage = parseInt(page, 10) || 0;
      await this.switchType(type);
      return;
    }

    // Default: load apps page 0
    await this.loadPage();
  }

  // Highlight the tab button for `type` and toggle the main containers
  // (list content, loading, error, docs, authors, examples).
  showView(type) {
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    const isList = !['docs', 'authors', 'examples'].includes(type);
    document.getElementById('content').style.display =
        isList ? 'block' : 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    for (const id of ['docs', 'authors', 'examples']) {
      document.getElementById(id).style.display =
          id === type ? 'block' : 'none';
    }
  }

  async openDirectItem(type, itemName) {
    try {
      const manifestPath = `${type}/${itemName}/index.json`;
      const response = await fetch(manifestPath);

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

  updateURL(type = null, page = null, itemName = null, examplesPath = null) {
    const params = new URLSearchParams();

    if (itemName) {
      // Direct item link: ?type=apps&item=ble.app
      params.set('type', type);
      params.set('item', itemName);
    } else if (type === 'examples') {
      params.set('type', 'examples');
      if (examplesPath) {
        params.set('path', examplesPath);
      }
    } else if (type) {
      // Page navigation: ?type=apps&page=1
      params.set('type', type);
      if (page !== null && page > 0) {
        params.set('page', page);
      }
    }

    const url = params.toString() ? `?${params.toString()}` : '/';
    window.history.pushState({type, page, itemName, examplesPath}, '', url);
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
        if (type === 'docs') {
          this.showDocumentation();
        } else if (type === 'authors') {
          this.showAuthors();
        } else if (type === 'examples') {
          this.showExamples();
        } else {
          this.switchType(type);
        }
      });
    });

    // Pagination (top & bottom)
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
    // Return to list view URL
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

  async showExamples() {
    this.showView('examples');
    const examplesContainer = document.getElementById('examples');

    this.examplesCurrentPath = '';
    this._examplesFileCache = {};
    this.renderExamplesBrowser(examplesContainer);
    this.updateURL('examples', null, null, '');
    await this.loadExamplesDir('', true);
    window.scrollTo({top: 0});
  }

  renderExamplesBrowser(container) {
    const REPO_URL = 'https://github.com/lilka-dev/examples';
    container.innerHTML = `
      <div class="examples-header">
        <div class="examples-breadcrumb" id="examples-breadcrumb"></div>
        <a href="${
        REPO_URL}" target="_blank" rel="noopener noreferrer" class="examples-repo-link">
          🐙 View on GitHub
        </a>
      </div>
      <div id="examples-body" class="examples-loading">Loading...</div>
      <div id="examples-file-viewer" class="examples-file-viewer" style="display:none;"></div>
    `;
  }

  renderBreadcrumb(path) {
    const bc = document.getElementById('examples-breadcrumb');
    if (!bc) return;
    const parts = path ? path.split('/') : [];
    let html =
        `<span class="breadcrumb-item breadcrumb-link" data-path="">📦 examples</span>`;
    let accumulated = '';
    for (const part of parts) {
      accumulated += (accumulated ? '/' : '') + part;
      html += `<span class="breadcrumb-sep">/</span>`;
      html += `<span class="breadcrumb-item breadcrumb-link" data-path="${
          this.escapeHtml(accumulated)}">${this.escapeHtml(part)}</span>`;
    }
    bc.innerHTML = html;
    bc.querySelectorAll('.breadcrumb-link').forEach(link => {
      link.addEventListener('click', () => {
        const target = link.dataset.path;
        this.updateURL('examples', null, null, target);
        document.getElementById('examples-file-viewer').style.display = 'none';
        document.getElementById('examples-body').style.display = 'block';
        this.loadExamplesDir(target, true);
      });
    });
  }

  async loadExamplesDir(path, skipPushState = false) {
    this.examplesCurrentPath = path;
    const bodyEl = document.getElementById('examples-body');
    bodyEl.style.display = 'block';
    bodyEl.className = 'examples-loading';
    bodyEl.innerHTML = 'Loading...';
    document.getElementById('examples-file-viewer').style.display = 'none';

    this.renderBreadcrumb(path);

    if (!skipPushState) {
      this.updateURL('examples', null, null, path);
    }

    const apiUrl = path ?
        `https://api.github.com/repos/lilka-dev/examples/contents/${path}` :
        'https://api.github.com/repos/lilka-dev/examples/contents';

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to load directory');
      const contents = await response.json();

      const dirs = contents.filter(i => i.type === 'dir')
                       .sort((a, b) => a.name.localeCompare(b.name));
      const files = contents.filter(i => i.type === 'file')
                        .sort((a, b) => a.name.localeCompare(b.name));

      let html = '<div class="examples-file-list">';

      if (path) {
        const parentPath =
            path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
        html += `
          <div class="file-list-item file-list-back" data-action="dir" data-path="${
            this.escapeHtml(parentPath)}">
            <span class="file-icon">⬆️</span>
            <span class="file-name">..</span>
          </div>`;
      }

      for (const dir of dirs) {
        html += `
          <div class="file-list-item file-list-dir" data-action="dir" data-path="${
            this.escapeHtml(dir.path)}">
            <span class="file-icon">📁</span>
            <span class="file-name">${this.escapeHtml(dir.name)}</span>
          </div>`;
      }

      for (const file of files) {
        const sizeStr = this.formatFileSize(file.size);
        const langIcon = this.getFileIcon(file.name);
        html += `
          <div class="file-list-item file-list-file" data-action="file" data-path="${
            this.escapeHtml(file.path)}" data-name="${
            this.escapeHtml(file.name)}" data-download="${
            this.escapeHtml(file.download_url || '')}">
            <span class="file-icon">${langIcon}</span>
            <span class="file-name">${this.escapeHtml(file.name)}</span>
            <span class="file-size">${sizeStr}</span>
          </div>`;
      }

      html += '</div>';
      bodyEl.className = '';
      bodyEl.innerHTML = html;

      bodyEl.querySelectorAll('.file-list-item').forEach(item => {
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          const itemPath = item.dataset.path;
          if (action === 'dir') {
            this.updateURL('examples', null, null, itemPath);
            this.loadExamplesDir(itemPath, true);
          } else if (action === 'file') {
            // Cache file info for back-button restoration
            if (!this._examplesFileCache) this._examplesFileCache = {};
            this._examplesFileCache[itemPath] = {
              name: item.dataset.name,
              download: item.dataset.download
            };
            this.updateURL('examples', null, null, itemPath);
            this.viewExampleFile(
                itemPath, item.dataset.name, item.dataset.download, true);
          }
        });
      });
    } catch (error) {
      const REPO_URL = 'https://github.com/lilka-dev/examples';
      bodyEl.className = 'examples-error';
      bodyEl.innerHTML = `
        <p>📦 Could not load directory listing.</p>
        <a href="${REPO_URL}${
          path ?
              '/tree/main/' + path :
              ''}" target="_blank" rel="noopener noreferrer" class="btn">Open on GitHub →</a>
      `;
    }
  }

  async viewExampleFile(path, name, downloadUrl, skipPushState = false) {
    const bodyEl = document.getElementById('examples-body');
    bodyEl.style.display = 'none';
    const viewer = document.getElementById('examples-file-viewer');
    viewer.style.display = 'block';
    viewer.innerHTML = '<div class="examples-loading">Loading file...</div>';

    this.renderBreadcrumb(path);

    if (!skipPushState) {
      this.updateURL('examples', null, null, path);
    }

    const REPO_URL = 'https://github.com/lilka-dev/examples';
    const rawUrl = downloadUrl ||
        `https://raw.githubusercontent.com/lilka-dev/examples/main/${path}`;

    try {
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      const imageExts =
          ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico'];

      if (imageExts.includes(ext)) {
        viewer.innerHTML = `
          <div class="file-viewer-header">
            <span class="file-viewer-name">${this.escapeHtml(name)}</span>
            <div class="file-viewer-actions">
              <a href="${REPO_URL}/blob/main/${
            path}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">View on GitHub</a>
              <a href="${rawUrl}" download="${
            this.escapeHtml(name)}" class="btn btn-sm">Download</a>
            </div>
          </div>
          <div class="file-viewer-image">
            <img src="${rawUrl}" alt="${this.escapeHtml(name)}">
          </div>`;
        return;
      }

      const response = await fetch(rawUrl);
      if (!response.ok) throw new Error('Failed to load file');
      const text = await response.text();

      const lang = this.detectLanguage(name);
      let highlighted;
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, {language: lang}).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }

      const lineCount = text.split('\n').length;
      const lineNumbers =
          Array.from({length: lineCount}, (_, i) => `<span>${i + 1}</span>`)
              .join('\n');

      viewer.innerHTML = `
        <div class="file-viewer-header">
          <span class="file-viewer-name">${this.escapeHtml(name)}</span>
          <span class="file-viewer-meta">${lineCount} lines · ${
          this.formatFileSize(text.length)}</span>
          <div class="file-viewer-actions">
            <button class="btn btn-sm" id="copy-code-btn">📋 Copy</button>
            <a href="${rawUrl}" download="${
          this.escapeHtml(name)}" class="btn btn-sm">⬇ Download</a>
            <a href="${REPO_URL}/blob/main/${
          path}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">GitHub</a>
          </div>
        </div>
        <div class="file-viewer-code">
          <div class="line-numbers">${lineNumbers}</div>
          <pre><code class="hljs">${highlighted}</code></pre>
        </div>`;

      document.getElementById('copy-code-btn')
          ?.addEventListener('click', () => {
            navigator.clipboard.writeText(text).then(() => {
              const btn = document.getElementById('copy-code-btn');
              btn.textContent = '✅ Copied!';
              setTimeout(() => btn.textContent = '📋 Copy', 2000);
            });
          });

      // Sync line numbers scroll with code scroll
      const codePreEl = viewer.querySelector('.file-viewer-code pre');
      const lineNumEl = viewer.querySelector('.line-numbers');
      if (codePreEl && lineNumEl) {
        codePreEl.addEventListener('scroll', () => {
          lineNumEl.scrollTop = codePreEl.scrollTop;
        });
      }
    } catch (error) {
      viewer.innerHTML = `
        <div class="examples-error">
          <p>Failed to load file: ${this.escapeHtml(error.message)}</p>
          <a href="${REPO_URL}/blob/main/${
          path}" target="_blank" rel="noopener noreferrer" class="btn">View on GitHub →</a>
        </div>`;
    }
  }

  getFileIcon(name) {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const icons = {
      'c': '🇨',
      'cpp': '⚙️',
      'h': '📎',
      'hpp': '📎',
      'lua': '🌙',
      'js': '📜',
      'ts': '📘',
      'py': '🐍',
      'json': '📋',
      'yml': '⚙️',
      'yaml': '⚙️',
      'md': '📝',
      'txt': '📄',
      'csv': '📊',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🖼️',
      'bin': '💾',
      'hex': '💾',
      'elf': '💾',
      'ino': '⚙️',
      'sh': '🐚',
      'bat': '🐚',
    };
    return icons[ext] || '📄';
  }

  detectLanguage(name) {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const langMap = {
      'c': 'c',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'hxx': 'cpp',
      'ino': 'cpp',
      'lua': 'lua',
      'js': 'javascript',
      'mjs': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'json': 'json',
      'yml': 'yaml',
      'yaml': 'yaml',
      'md': 'markdown',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'bat': 'dos',
      'cmd': 'dos',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'xml': 'xml',
      'sql': 'sql',
      'makefile': 'makefile',
      'cmake': 'cmake',
      'txt': 'plaintext',
    };
    if (name.toLowerCase() === 'makefile') return 'makefile';
    if (name.toLowerCase() === 'cmakelists.txt') return 'cmake';
    return langMap[ext] || null;
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async showAuthors() {
    this.showView('authors');
    const authorsContainer = document.getElementById('authors');

    this.updateURL('authors');

    try {
      const response = await fetch('authors.json');
      if (!response.ok) {
        throw new Error('Failed to load authors data');
      }
      const authors = await response.json();
      authorsContainer.innerHTML = this.renderAuthorsPage(authors);

      // Add click handlers for author item cards
      authorsContainer.querySelectorAll('.author-item-card').forEach(card => {
        card.addEventListener('click', async () => {
          const itemType = card.dataset.itemType;
          const itemPath = card.dataset.itemPath;
          try {
            const manifestPath = `${itemType}/${itemPath}/index.json`;
            const resp = await fetch(manifestPath);
            if (!resp.ok) throw new Error(`Item not found: ${itemPath}`);
            const manifest = await resp.json();
            this.currentType = itemType;
            this.showModal(manifest, itemPath);
          } catch (err) {
            console.error('Error opening item from authors:', err);
          }
        });
      });

      // Collapsible author sections
      authorsContainer.querySelectorAll('.author-section-header')
          .forEach(header => {
            header.addEventListener('click', () => {
              const section = header.closest('.author-section');
              section.classList.toggle('collapsed');
            });
          });
    } catch (error) {
      authorsContainer.innerHTML =
          `<p style="color: var(--error);">Failed to load authors: ${
              error.message}</p>`;
    }
  }

  renderAuthorsPage(authors) {
    const authorNames = Object.keys(authors);
    let html = `<h2 class="authors-title">Authors (${authorNames.length})</h2>`;

    for (const author of authorNames) {
      const items = authors[author];
      const apps = items.filter(i => i.type === 'apps');
      const mods = items.filter(i => i.type === 'mods');
      const badge = [];
      if (apps.length)
        badge.push(`${apps.length} app${apps.length > 1 ? 's' : ''}`);
      if (mods.length)
        badge.push(`${mods.length} mod${mods.length > 1 ? 's' : ''}`);

      const sectionId = `author-${this.authorSlug(author)}`;
      html += `<div class="author-section" id="${sectionId}">`;
      html += `<div class="author-section-header">`;
      html +=
          `<span class="author-section-name">${this.escapeHtml(author)}</span>`;
      html += `<span class="author-section-badge">${badge.join(', ')}</span>`;
      html += `<span class="author-section-toggle">&#9660;</span>`;
      html += `</div>`;
      html += `<div class="author-section-body">`;
      html += `<div class="author-items-grid">`;

      for (const item of items) {
        const iconPath =
            item.icon ? `${item.type}/${item.path}/static/${item.icon}` : '';
        const typeLabel = item.type === 'apps' ? 'App' : 'Mod';
        const itemName = this.localized(item, 'name');
        const itemShortDesc = this.localized(item, 'short_description') || '';
        html += `<div class="author-item-card" data-item-type="${
            item.type}" data-item-path="${this.escapeHtml(item.path)}">`;
        if (item.icon) {
          html += `<img src="${iconPath}" alt="${
              this.escapeHtml(
                  itemName)}" class="icon" onerror="this.style.display='none'">`;
        }
        html += `<h3>${this.escapeHtml(itemName)}</h3>`;
        html += `<span class="author-item-type type-${item.type}">${
            typeLabel}</span>`;
        html +=
            `<div class="short-desc">${this.escapeHtml(itemShortDesc)}</div>`;
        html += `</div>`;
      }

      html += `</div></div></div>`;
    }

    return html;
  }

  async showDocumentation() {
    this.showView('docs');
    const docsContainer = document.getElementById('docs');

    try {
      // Load the README matching the selected language, falling back to
      // the default English README.md if the localized one is missing.
      const readmeFile =
          this.currentLang === 'uk' ? 'README.uk.md' : 'README.md';
      let response = await fetch(readmeFile);
      if (!response.ok && readmeFile !== 'README.md') {
        response = await fetch('README.md');
      }
      if (!response.ok) {
        throw new Error('Failed to load documentation');
      }
      const markdown = await response.text();
      docsContainer.innerHTML = marked.parse(markdown);
    } catch (error) {
      docsContainer.innerHTML =
          `<p style="color: var(--error);">Failed to load documentation: ${
              error.message}</p>`;
    }
    window.scrollTo({top: 0});
  }

  async loadPage() {
    // Don't load if we're on docs/examples tab
    if (this.currentType === 'docs' || this.currentType === 'examples') {
      return;
    }

    this.showLoading(true);
    this.hideError();

    try {
      const indexPath = `${this.currentType}/index_${this.currentPage}.json`;
      const response = await fetch(indexPath);

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
        const response = await fetch(manifestPath);
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
        `${this.currentType}/${manifestName}/static/${manifest.icon}`;

    const cardName = this.localized(manifest, 'name');
    const cardShortDesc = this.localized(manifest, 'short_description') || '';
    card.innerHTML = `
            ${
        manifest.icon ?
            `<img src="${iconPath}" alt="${
                this.escapeHtml(
                    cardName)}" class="icon" onerror="this.style.display='none'">` :
            ''}
            <h3>${this.escapeHtml(cardName)}</h3>
            <div class="author"><a href="?type=authors&author=${
        encodeURIComponent(
            manifest.author)}" class="author-link" data-author="${
        this.escapeHtml(
            manifest.author)}">${this.escapeHtml(manifest.author)}</a></div>
            <div class="short-desc">${this.escapeHtml(cardShortDesc)}</div>
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
      this.showModal(manifest, manifestName);
      // Update URL when opening modal
      this.updateURL(this.currentType, null, manifestName);
    });

    return card;
  }

  // --- Modal section renderers -------------------------------------------

  renderFileItem(file, basePath, itemName, event, itemAttr) {
    if (!file || !file.location) return '';
    return `
      <div class="file-item">
        <p><strong>${this.escapeHtml(file.type || 'Unknown')}:</strong> ${
        this.escapeHtml(file.location)}</p>
        <a href="${basePath}/static/${
        file.location}" download class="download-btn-small" data-umami-event="${
        event}" data-umami-event-${itemAttr}="${
        this.escapeHtml(itemName)}" data-umami-event-type="${
        this.escapeHtml(file.type)}">⬇️ Download</a>
      </div>`;
  }

  renderFilesSection(manifest, basePath) {
    let html = '';

    if (this.currentType === 'apps' && manifest.entryfile &&
        manifest.entryfile.location) {
      const entryFile = manifest.entryfile;
      html += `
        <div class="modal-section">
          <h3>📦 Entry File</h3>
          <p><strong>Type:</strong> ${
          this.escapeHtml(entryFile.type || 'N/A')}</p>
          <p><strong>File:</strong> ${this.escapeHtml(entryFile.location)}</p>
          <a href="${basePath}/static/${
          entryFile
              .location}" download class="download-btn" data-umami-event="download-entry-file" data-umami-event-app="${
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
                      'app'))
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
          <a href="${basePath}/${
          manifest
              .package}" download class="download-btn" data-umami-event="download-package-zip" data-umami-event-item="${
          this.escapeHtml(manifest.name)}">⬇️ Download ZIP</a>
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
                    index}" onerror="this.style.display='none'">`)
            .join('')}
        </div>
      </div>`;
  }

  renderMarkdownSection(title, text) {
    if (!text || !text.trim()) return '';
    return `
      <div class="modal-section">
        <h3>${title}</h3>
        <div class="markdown-content">${marked.parse(text)}</div>
      </div>`;
  }

  showModal(manifest, manifestName) {
    // Remember the currently open manifest so it can be re-rendered when the
    // language is switched while the modal is open.
    this._currentManifest = manifest;
    this._currentManifestName = manifestName;

    const modalName = this.localized(manifest, 'name');

    // Track manifest views
    if (window.umami) {
      window.umami.track('view-manifest', {
        type: this.currentType,
        name: manifest.name,
        manifest: manifestName,
        author: manifest.author
      });
    }

    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');

    // manifestName already includes the full path relative to type
    const basePath = `${this.currentType}/${manifestName}`;

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
                    modalName)}" class="modal-icon" onerror="this.style.display='none'">` :
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

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  authorSlug(author) {
    return (author || '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  async navigateToAuthor(author) {
    // Close modal if open
    document.getElementById('modal').style.display = 'none';

    // Load authors page
    await this.showAuthors();

    // Scroll to the author section & highlight it
    const sectionId = `author-${this.authorSlug(author)}`;
    const section = document.getElementById(sectionId);
    if (section) {
      // Make sure it's not collapsed
      section.classList.remove('collapsed');
      section.scrollIntoView({behavior: 'smooth', block: 'start'});
      section.classList.add('author-highlight');
      setTimeout(() => section.classList.remove('author-highlight'), 2000);
    }

    // Update URL
    const params = new URLSearchParams();
    params.set('type', 'authors');
    params.set('author', author);
    window.history.pushState(
        {type: 'authors', author}, '', `?${params.toString()}`);
  }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LilkaRepository();
});
