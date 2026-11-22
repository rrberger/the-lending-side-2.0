// State Management
const state = {
  posts: [],
  pages: [],
  exifMap: {},
  // Default to journal view (film_strip commented out for now)
  currentViewMode: (localStorage.getItem('viewMode') === 'film_strip' || !localStorage.getItem('viewMode')) ? 'journal' : localStorage.getItem('viewMode'),
  currentTheme: localStorage.getItem('theme') || 'dark',
  lightboxImages: [],
  lightboxIndex: 0,
  selectedPrintImage: null,

  // Editor State
  activeEditorPost: null,
  editorUploadedImages: []
};

// DOM Elements
const elements = {
  viewContent: document.getElementById('view-content'),
  layoutSwitcher: document.getElementById('layout-switcher-container'),
  switchBtns: document.querySelectorAll('.switch-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  themeIconText: document.getElementById('theme-icon-text'),
  menuLinks: document.querySelectorAll('.menu-link'),
  currentYear: document.getElementById('current-year'),

  // Lightbox
  lightbox: document.getElementById('lightbox'),
  lightboxImg: document.getElementById('lightbox-img'),
  lightboxTitle: document.getElementById('lightbox-title'),
  lightboxExif: document.getElementById('lightbox-exif'),
  lightboxClose: document.getElementById('lightbox-close'),
  lightboxPrev: document.getElementById('lightbox-prev'),
  lightboxNext: document.getElementById('lightbox-next'),

  // Inquiry Modal
  inquiryModal: document.getElementById('inquiry-modal'),
  inquiryClose: document.getElementById('inquiry-close'),
  inquiryImg: document.getElementById('inquiry-img'),
  inquiryPhotoTitle: document.getElementById('inquiry-photo-title'),
  inquiryForm: document.getElementById('inquiry-form'),
  printSize: document.getElementById('print-size'),
  clientName: document.getElementById('client-name'),
  clientEmail: document.getElementById('client-email'),
  clientNotes: document.getElementById('client-notes'),
};

// Initialize Application
async function init() {
  if (elements.currentYear) {
    elements.currentYear.textContent = new Date().getFullYear();
  }

  setTheme(state.currentTheme);
  bindEvents();
  renderLoading();

  await fetchDatabase();
  handleRoute();
}

// Fetch posts database from local file
async function fetchDatabase() {
  try {
    const response = await fetch('./data/posts.json?t=' + Date.now());
    if (!response.ok) throw new Error('Data file not found');
    const data = await response.json();

    state.posts = data.posts || [];
    state.pages = data.pages || [];
    state.exifMap = data.exif || {};
  } catch (error) {
    console.error('Failed to load posts database:', error);
    renderError();
  }
}

// Bind Event Listeners
function bindEvents() {
  window.addEventListener('hashchange', handleRoute);

  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', () => {
      const nextTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }

  elements.switchBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const viewMode = e.target.getAttribute('data-view');
      setViewMode(viewMode);
    });
  });

  if (elements.lightboxClose) elements.lightboxClose.addEventListener('click', closeLightbox);
  if (elements.lightboxPrev) elements.lightboxPrev.addEventListener('click', prevLightbox);
  if (elements.lightboxNext) elements.lightboxNext.addEventListener('click', nextLightbox);

  document.addEventListener('keydown', (e) => {
    if (!elements.lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevLightbox();
    if (e.key === 'ArrowRight') nextLightbox();
  });

  // Touch gestures in Lightbox
  let touchStartX = 0;
  let touchEndX = 0;
  elements.lightbox.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  elements.lightbox.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const threshold = 55;
    if (touchEndX < touchStartX - threshold) nextLightbox();
    if (touchEndX > touchStartX + threshold) prevLightbox();
  }, { passive: true });

  elements.lightbox.addEventListener('click', (e) => {
    if (e.target === elements.lightbox || e.target.classList.contains('lightbox-content')) {
      closeLightbox();
    }
  });

  if (elements.inquiryClose) elements.inquiryClose.addEventListener('click', closeInquiry);
  if (elements.inquiryForm) elements.inquiryForm.addEventListener('submit', submitInquiry);
  elements.inquiryModal.addEventListener('click', (e) => {
    if (e.target === elements.inquiryModal) closeInquiry();
  });
}

// Router Controller
function handleRoute() {
  const hash = window.location.hash || '#home';
  updateActiveLinks(hash);

  window.scrollTo(0, 0);
  closeLightbox();
  closeInquiry();

  if (hash.startsWith('#post/')) {
    const slug = hash.replace('#post/', '');
    elements.layoutSwitcher.style.display = 'none';
    renderPostDetail(slug);
    return;
  }

  switch (hash) {
    case '#home':
    case '':
      elements.layoutSwitcher.style.display = 'block';
      renderHome();
      break;
    case '#music':
    case '#playlists':
      elements.layoutSwitcher.style.display = 'none';
      renderMusic();
      break;
    case '#prints':
      elements.layoutSwitcher.style.display = 'none';
      renderPrints();
      break;
    case '#about':
      elements.layoutSwitcher.style.display = 'none';
      renderAbout();
      break;
    default:
      elements.layoutSwitcher.style.display = 'none';
      renderHome();
  }
}

// Update Active Link styling
function updateActiveLinks(hash) {
  const mainHash = hash.split('/')[0];
  elements.menuLinks.forEach(link => {
    const target = link.getAttribute('href');
    const isMusic = (mainHash === '#music' || mainHash === '#playlists') && (target === '#music' || target === '#playlists');
    if (target === mainHash || isMusic) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// Set Theme
function setTheme(theme) {
  state.currentTheme = theme;
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  if (elements.themeIconText) {
    elements.themeIconText.textContent = theme === 'dark' ? '☀ Light Mode' : '☾ Dark Mode';
  }
}

// Set View mode
function setViewMode(viewMode) {
  if (viewMode === 'film_strip') viewMode = 'journal';
  state.currentViewMode = viewMode;
  localStorage.setItem('viewMode', viewMode);
  elements.switchBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewMode);
  });
  if (window.location.hash === '#home' || window.location.hash === '') {
    renderHome();
  }
}

// EXIF metadata loader
function getExifString(imageSrc) {
  if (!imageSrc) return '';
  const filename = imageSrc.split('/').pop().split('?')[0];
  const exif = state.exifMap[filename];
  if (!exif) return '';

  const parts = [];
  if (exif.camera) parts.push(exif.camera);
  if (exif.focal_length) parts.push(exif.focal_length);
  if (exif.aperture) parts.push(exif.aperture);
  if (exif.shutter_speed) parts.push(exif.shutter_speed);
  if (exif.iso) parts.push(`ISO ${exif.iso}`);

  return parts.join('  •  ');
}

// HTML Image parser
function parseImagesFromHTML(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const imgElements = doc.querySelectorAll('img');
  return Array.from(imgElements).map(img => {
    const rawSrc = img.getAttribute('data-orig-file') || img.getAttribute('src') || '';
    const cleanSrc = rawSrc.split('?')[0];
    return {
      src: cleanSrc,
      alt: img.getAttribute('alt') || '',
      title: img.getAttribute('data-image-title') || img.getAttribute('alt') || 'Photograph'
    };
  });
}

// Loading UI
function renderLoading() {
  elements.viewContent.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">
      > FETCHING DATA... [▉]
    </div>
  `;
}

// Error UI
function renderError() {
  elements.viewContent.innerHTML = `
    <div class="page-container">
      <div class="terminal-box" data-title="system_alert">
        <h2 style="font-weight:600; text-transform:uppercase; margin-bottom:1rem; color:var(--accent-color);">[ERROR] DATABASE UNREACHABLE</h2>
        <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1.5rem;">The local JSON file could not be read. Please launch the API server using:</p>
        <pre style="background:rgba(255, 157, 0, 0.05); padding:1rem; border:1px dashed var(--border-color); color:var(--accent-color); font-size:0.75rem;">python server.py</pre>
      </div>
    </div>
  `;
}

// --- VIEW 1: HOME PAGE ---
function renderHome() {
  if (state.posts.length === 0) {
    renderLoading();
    return;
  }
  // film_strip view temporarily commented out (TO DO: revisit layout)
  /*
  if (state.currentViewMode === 'film_strip') {
    renderFilmStripView();
  } else
  */
  if (state.currentViewMode === 'index') {
    renderIndexView();
  } else {
    renderJournalView();
  }
}

// A. Film_strip horizontal scroll view
function renderFilmStripView() {
  const totalPosts = state.posts.length;
  let html = `
    <div class="film_strip-wrapper">
      <!-- Film Strip HUD Navigation Dock -->
      <div class="film_strip-controls" id="film-controls">
        <button class="film-nav-btn" id="film-prev" aria-label="Previous entry" title="Previous post (Left Arrow)">&larr; PREV</button>
        <div class="film-counter" id="film-counter">
          <span class="film-counter-idx">01</span> / <span class="film-counter-total">${String(totalPosts).padStart(2, '0')}</span>
        </div>
        <button class="film-nav-btn" id="film-next" aria-label="Next entry" title="Next post (Right Arrow)">NEXT &rarr;</button>
      </div>

      <!-- Timeline Progress Indicator -->
      <div class="film_strip-progress-track">
        <div class="film_strip-progress-fill" id="film-progress"></div>
      </div>

      <div class="film_strip-container" id="film_strip-canvas">
  `;

  state.posts.forEach((post, postIdx) => {
    const images = parseImagesFromHTML(post.content);

    if (post.featured_image) {
      const isFeaturedIncluded = images.some(img => img.src === post.featured_image);
      if (!isFeaturedIncluded) {
        images.unshift({ src: post.featured_image, alt: post.title, title: post.title });
      }
    }

    const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    }).toLowerCase();

    html += `
      <section class="film_strip-post" data-post-idx="${postIdx}" id="film-post-${postIdx}">
        <div class="film_strip-meta">
          <span class="post-date-mono">[ ${formattedDate} ]</span>
          <h2>${post.title}</h2>
          <div class="excerpt">${post.excerpt || ''}</div>
          <a href="#post/${post.slug}" class="read-more-btn">READ_ENTRY &rarr;</a>
        </div>
        <div class="film_strip-gallery">
    `;

    images.forEach((img, imgIdx) => {
      html += `
        <div class="film_strip-image-container" data-post-idx="${postIdx}" data-img-idx="${imgIdx}">
          <img src="${img.src}" alt="${img.alt}" loading="lazy">
        </div>
      `;
    });

    html += `
        </div>
      </section>
    `;
  });

  html += `
      </div>
    </div>
  `;
  elements.viewContent.innerHTML = html;

  const canvas = document.getElementById('film_strip-canvas');
  const postElements = elements.viewContent.querySelectorAll('.film_strip-post');
  const counterEl = document.getElementById('film-counter');
  const progressEl = document.getElementById('film-progress');
  const btnPrev = document.getElementById('film-prev');
  const btnNext = document.getElementById('film-next');
  let currentPostIndex = 0;

  function scrollToPost(index) {
    if (index < 0) index = 0;
    if (index >= postElements.length) index = postElements.length - 1;
    currentPostIndex = index;
    const target = postElements[currentPostIndex];
    if (target && canvas) {
      canvas.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    }
  }

  if (btnPrev) btnPrev.addEventListener('click', () => scrollToPost(currentPostIndex - 1));
  if (btnNext) btnNext.addEventListener('click', () => scrollToPost(currentPostIndex + 1));

  // Convert vertical scroll wheel to horizontal
  if (canvas) {
    canvas.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        canvas.scrollLeft += e.deltaY * 1.2;
        e.preventDefault();
      }
    }, { passive: false });

    // Track active post and update counter & progress
    canvas.addEventListener('scroll', () => {
      const canvasLeft = canvas.getBoundingClientRect().left;
      let closestIdx = 0;
      let minDiff = Infinity;
      postElements.forEach((el, idx) => {
        const diff = Math.abs(el.getBoundingClientRect().left - canvasLeft);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      currentPostIndex = closestIdx;
      if (counterEl) {
        const idxSpan = counterEl.querySelector('.film-counter-idx');
        if (idxSpan) idxSpan.textContent = String(closestIdx + 1).padStart(2, '0');
      }
      if (progressEl) {
        const maxScroll = canvas.scrollWidth - canvas.clientWidth;
        const pct = maxScroll > 0 ? (canvas.scrollLeft / maxScroll) * 100 : 0;
        progressEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      }
    }, { passive: true });
  }

  // Keyboard navigation
  const handleKeyNavigation = (e) => {
    if (state.currentViewMode !== 'film_strip' || window.location.hash.startsWith('#post')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      scrollToPost(currentPostIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      scrollToPost(currentPostIndex - 1);
    }
  };
  window.removeEventListener('keydown', window._filmKeyHandler);
  window._filmKeyHandler = handleKeyNavigation;
  window.addEventListener('keydown', window._filmKeyHandler);

  // Bind Lightbox clicks
  const imageContainers = elements.viewContent.querySelectorAll('.film_strip-image-container');
  imageContainers.forEach(container => {
    container.addEventListener('click', () => {
      const postIdx = parseInt(container.getAttribute('data-post-idx'));
      const imgIdx = parseInt(container.getAttribute('data-img-idx'));
      openLightboxForPost(postIdx, imgIdx);
    });
  });
}

// B. Journal vertical flow view
function renderJournalView() {
  let html = `<div class="journal-container">`;

  state.posts.forEach((post) => {
    const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).toLowerCase();

    let processedContent = post.content;

    html += `
      <article class="journal-post-card">
        <header class="journal-post-header">
          <span class="post-date-mono">[ ${formattedDate} ]</span>
          <h2><a href="#post/${post.slug}">${post.title}</a></h2>
        </header>
        <div class="journal-post-content">
          ${processedContent}
        </div>
      </article>
    `;
  });

  html += `</div>`;
  elements.viewContent.innerHTML = html;

  // Bind Lightbox triggers on journal images
  const journalImages = elements.viewContent.querySelectorAll('.journal-post-content img');
  const allImageUrls = Array.from(journalImages).map(img => {
    const rawSrc = img.getAttribute('data-orig-file') || img.getAttribute('src') || '';
    const cleanSrc = rawSrc.split('?')[0];
    return {
      src: cleanSrc,
      alt: img.getAttribute('alt') || '',
      title: img.getAttribute('data-image-title') || img.getAttribute('alt') || 'Photograph'
    };
  });

  journalImages.forEach((img, idx) => {
    img.style.cursor = 'zoom-in';
    const parentA = img.closest('a');
    if (parentA) {
      parentA.addEventListener('click', (e) => {
        e.preventDefault();
        openLightboxGlobal(allImageUrls, idx);
      });
    }
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLightboxGlobal(allImageUrls, idx);
    });
  });
}

// C. Grid Index view
function renderIndexView() {
  let html = `
    <div class="index-container">
      <div class="index-grid">
  `;

  state.posts.forEach((post) => {
    const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    }).toLowerCase();

    let imageSrc = post.featured_image;
    if (!imageSrc) {
      const extracted = parseImagesFromHTML(post.content);
      imageSrc = extracted.length > 0 ? extracted[0].src : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }

    html += `
      <div class="index-card">
        <a href="#post/${post.slug}">
          <div class="index-card-image">
            <img src="${imageSrc}" alt="${post.title}" loading="lazy">
          </div>
          <div class="index-card-meta">
            <span class="index-card-date">${formattedDate}</span>
            <h3 class="index-card-title">${post.title}</h3>
          </div>
        </a>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;
  elements.viewContent.innerHTML = html;
}

// --- RENDER 2: POST DETAIL PAGE ---
function renderPostDetail(slug) {
  const post = state.posts.find(p => p.slug === slug);
  if (!post) {
    elements.viewContent.innerHTML = `
      <div class="post-detail-view" style="text-align:center;">
        <a href="#home" class="back-link">&larr; Back to gallery</a>
        <h2 style="font-size:1.5rem; font-weight:600; margin-bottom:1rem;">Entry not found</h2>
        <p style="color:var(--text-muted)">The post could not be retrieved.</p>
      </div>
    `;
    return;
  }

  const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).toLowerCase();

  let html = `
    <article class="post-detail-view">
      <a href="#home" class="back-link">&larr; BACK_TO_FEED</a>
      <header class="journal-post-header" style="text-align:center;">
        <span class="post-date-mono">[ ${formattedDate} ]</span>
        <h1 style="font-size:2rem; font-weight:600; margin-top:0.5rem; color:var(--accent-color);">${post.title}</h1>
      </header>
      <div class="journal-post-content">
        ${post.content}
      </div>

      <!-- Comments Section -->
      <section class="comments-section" id="comments-section">
        <div class="comments-header">
          <span class="post-date-mono">// DISCUSSION</span>
          <h3>comments (<span id="comments-count">0</span>)</h3>
        </div>

        <!-- Comments List -->
        <div class="comments-list" id="comments-list">
          <div class="comments-loading">> FETCHING_COMMENTS...</div>
        </div>

        <!-- Add Comment Form -->
        <form class="comment-form" id="comment-form">
          <span class="comment-form-title">leave a note / thought</span>
          
          <!-- Bot Honeypot (Invisible) -->
          <input type="text" name="website_hp" id="comment-hp" style="display:none;" tabindex="-1" autocomplete="off">

          <div class="comment-form-group">
            <input type="text" id="comment-author" placeholder="your name..." required maxlength="60" autocomplete="name">
          </div>

          <div class="comment-form-group">
            <textarea id="comment-content" rows="4" placeholder="share your reaction, photo questions, or thoughts..." required maxlength="2000"></textarea>
          </div>

          <div class="comment-form-actions">
            <!-- Cloudflare Turnstile Container -->
            <div id="turnstile-container"></div>
            <button type="submit" class="comment-submit-btn" id="comment-submit-btn">post comment</button>
          </div>
          <div class="comment-status" id="comment-status"></div>
        </form>
      </section>
    </article>
  `;

  elements.viewContent.innerHTML = html;

  const postImages = elements.viewContent.querySelectorAll('.journal-post-content img');
  const allImageUrls = Array.from(postImages).map(img => {
    const rawSrc = img.getAttribute('data-orig-file') || img.getAttribute('src') || '';
    const cleanSrc = rawSrc.split('?')[0];
    return {
      src: cleanSrc,
      alt: img.getAttribute('alt') || '',
      title: img.getAttribute('data-image-title') || post.title || 'Photograph'
    };
  });

  postImages.forEach((img, idx) => {
    img.style.cursor = 'zoom-in';
    const parentA = img.closest('a');
    if (parentA) {
      parentA.addEventListener('click', (e) => {
        e.preventDefault();
        openLightboxGlobal(allImageUrls, idx);
      });
    }
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLightboxGlobal(allImageUrls, idx);
    });
  });

  // Initialize Cloudflare Native Comments
  initComments(slug);
}

// --- COMMENTS SYSTEM (Cloudflare Turnstile + D1) ---
const TURNSTILE_SITE_KEY = '0x4AAAAAAFKwqUaas_zRbXql';
let currentTurnstileWidgetId = null;

async function initComments(slug) {
  const listEl = document.getElementById('comments-list');
  const countEl = document.getElementById('comments-count');
  const formEl = document.getElementById('comment-form');
  const statusEl = document.getElementById('comment-status');
  const submitBtn = document.getElementById('comment-submit-btn');

  if (!listEl || !formEl) return;

  // 1. Fetch existing comments
  try {
    const res = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json();
      const comments = data.comments || [];
      if (countEl) countEl.textContent = comments.length;

      if (comments.length === 0) {
        listEl.innerHTML = `<div class="comment-empty">> no comments yet. be the first to leave a thought.</div>`;
      } else {
        listEl.innerHTML = comments.map(c => {
          const dateStr = new Date(c.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }).toLowerCase();
          return `
            <div class="comment-card">
              <div class="comment-meta">
                <span class="comment-author">${c.author_name}</span>
                <span class="comment-date">[ ${dateStr} ]</span>
              </div>
              <div class="comment-body">${c.content}</div>
            </div>
          `;
        }).join('');
      }
    } else {
      listEl.innerHTML = `<div class="comment-empty">> comments unavailable at this time.</div>`;
    }
  } catch (err) {
    listEl.innerHTML = `<div class="comment-empty">> comments unavailable.</div>`;
  }

  // 2. Render Turnstile Widget
  const turnstileContainer = document.getElementById('turnstile-container');
  if (turnstileContainer && window.turnstile) {
    try {
      if (currentTurnstileWidgetId !== null) {
        window.turnstile.remove(currentTurnstileWidgetId);
        currentTurnstileWidgetId = null;
      }
      currentTurnstileWidgetId = window.turnstile.render('#turnstile-container', {
        sitekey: TURNSTILE_SITE_KEY,
        theme: state.currentTheme === 'light' ? 'light' : 'dark',
        size: 'flexible'
      });
    } catch (e) {
      console.warn("Turnstile init deferred:", e);
    }
  }

  // 3. Form Submit Handler
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'comment-status';
    }

    const author = document.getElementById('comment-author').value.trim();
    const content = document.getElementById('comment-content').value.trim();
    const hp = document.getElementById('comment-hp').value;

    let turnstileToken = '';
    if (window.turnstile && currentTurnstileWidgetId !== null) {
      turnstileToken = window.turnstile.getResponse(currentTurnstileWidgetId);
      if (!turnstileToken) {
        if (statusEl) {
          statusEl.textContent = '> please complete the security check above.';
          statusEl.className = 'comment-status error';
        }
        return;
      }
    }

    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = '> posting comment...';

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_slug: slug,
          author_name: author,
          content: content,
          turnstile_token: turnstileToken,
          honeypot: hp
        })
      });

      const outcome = await res.json();
      if (res.ok && outcome.status === 'success') {
        if (statusEl) {
          statusEl.textContent = '> comment posted successfully!';
          statusEl.className = 'comment-status success';
        }
        document.getElementById('comment-content').value = '';

        // Reset Turnstile
        if (window.turnstile && currentTurnstileWidgetId !== null) {
          window.turnstile.reset(currentTurnstileWidgetId);
        }

        // Prepend comment to list
        const emptyNotice = listEl.querySelector('.comment-empty');
        if (emptyNotice) listEl.innerHTML = '';

        const newCommentHtml = `
          <div class="comment-card" style="border-color:var(--accent-color);">
            <div class="comment-meta">
              <span class="comment-author">${outcome.comment ? outcome.comment.author_name : author}</span>
              <span class="comment-date">[ just now ]</span>
            </div>
            <div class="comment-body">${outcome.comment ? outcome.comment.content : content}</div>
          </div>
        `;
        listEl.insertAdjacentHTML('beforeend', newCommentHtml);
        if (countEl) {
          const currentCount = parseInt(countEl.textContent) || 0;
          countEl.textContent = currentCount + 1;
        }
      } else {
        if (statusEl) {
          statusEl.textContent = `> error: ${outcome.error || 'could not post comment'}`;
          statusEl.className = 'comment-status error';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `> network error: ${err.message}`;
        statusEl.className = 'comment-status error';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// Helper function for safe HTML escaping
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

let musicPollTimer = null;

async function fetchMusicData() {
  try {
    const res = await fetch('/api/music');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    try {
      const fallbackRes = await fetch('data/music.json');
      if (fallbackRes.ok) return await fallbackRes.json();
    } catch { }
    return { now_playing: null, recent_spins: [] };
  }
}

// --- RENDER 3: MUSIC & VINYL ROTATION PAGE (02_music) ---
async function renderMusic() {
  clearInterval(musicPollTimer);

  // Initial skeleton
  elements.viewContent.innerHTML = `
    <div class="page-container music-page">
      <div class="music-header">
        <h1>music</h1>
        <p class="music-intro">
          this is an api that posts what records i'm playing on my turn table. i wanted to bridge my analog audio setup - where i listen to the most music - with my little corner of the soon-to-be-dead internet.
        </p>
      </div>

      <div id="music-widget-mount" class="music-widget-mount">
        <div class="music-loading-skeleton">
          <span class="pulse-led live"></span>
          <span class="skeleton-text">// reading turntable telemetry...</span>
        </div>
      </div>

      <div class="music-history-section">
        <div class="music-section-title-row">
          <span class="section-badge">// 01_CURRENT ROTATION & VINYL ARCHIVE</span>
          <button type="button" class="music-sync-btn" onclick="renderMusic()" title="Refresh live telemetry">
            [ ↺ sync ]
          </button>
        </div>
        <div id="music-grid-mount" class="music-grid">
          <div class="music-grid-loading">// loading rotation archive...</div>
        </div>
      </div>

      <div class="music-histogram-section">
        <div class="music-section-title-row">
          <span class="section-badge">// 02_LISTENING TELEMETRY & FREQUENCY HISTOGRAM</span>
          <span class="section-badge-right" id="histogram-meta-badge">TELEMETRY ARCHIVE</span>
        </div>
        <div id="music-histogram-mount" class="music-histogram-mount">
          <div class="music-grid-loading">// analyzing frequency telemetry...</div>
        </div>
      </div>
    </div>
  `;

  const data = await fetchMusicData();
  const widgetMount = document.getElementById('music-widget-mount');
  const gridMount = document.getElementById('music-grid-mount');

  if (!widgetMount || !gridMount) return;

  const np = data.now_playing;
  const recent = data.recent_spins || [];

  // 1. RENDER NOW SPINNING WIDGET
  if (np && np.active) {
    const artUrl = np.cover_image_url || np.thumb_image_url || '';
    const artHtml = artUrl
      ? `<img src="${artUrl}" alt="${escapeHtml(np.title)}" class="now-spinning-art" loading="lazy">`
      : `<div class="art-fallback"><span class="fallback-vinyl-icon">💽</span></div>`;

    widgetMount.innerHTML = `
      <div class="now-spinning-widget active">
        <div class="widget-status-bar">
          <div class="status-left">
            <span class="pulse-led live"></span>
            <span class="status-label">LIVE ON TURNTABLE // NOW SPINNING</span>
          </div>
          <div class="status-right">
            <span class="tag-pill accent">SIDE ${escapeHtml(np.side || 'A')}</span>
            <span class="tag-pill">${np.rpm || 33} RPM</span>
            <span class="tag-pill">${escapeHtml(np.format || 'LP')}</span>
          </div>
        </div>

        <div class="now-spinning-body">
          <div class="sleeve-jacket-wrap">
            <div class="vinyl-disc-peek spinning"></div>
            <div class="jacket-frame">
              ${artHtml}
            </div>
          </div>

          <div class="now-spinning-details">
            <div class="meta-headline">
              <span class="live-badge">NEEDLE DROPPED</span>
              ${np.started_at ? `<span class="time-elapsed">${formatRelativeTime(np.started_at)}</span>` : ''}
            </div>
            <h2 class="record-title">${escapeHtml(np.title)}</h2>
            <h3 class="record-artist">${escapeHtml(np.artist)}</h3>

            <div class="record-specs-hud">
              ${np.year ? `<div class="spec-cell"><span class="k">YEAR</span><span class="v">${np.year}</span></div>` : ''}
              ${np.label ? `<div class="spec-cell"><span class="k">LABEL</span><span class="v">${escapeHtml(np.label)}</span></div>` : ''}
              ${np.genre ? `<div class="spec-cell"><span class="k">GENRE</span><span class="v">${escapeHtml(np.genre)}</span></div>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Idle state: show last spun record or clean idle terminal card
    const lastSpun = recent[0] || null;
    const artUrl = lastSpun ? (lastSpun.cover_image_url || lastSpun.thumb_image_url || '') : '';
    const artHtml = artUrl
      ? `<img src="${artUrl}" alt="${escapeHtml(lastSpun.title)}" class="now-spinning-art" loading="lazy">`
      : `<div class="art-fallback"><span class="fallback-vinyl-icon">💽</span></div>`;

    widgetMount.innerHTML = `
      <div class="now-spinning-widget idle">
        <div class="widget-status-bar">
          <div class="status-left">
            <span class="idle-dot"></span>
            <span class="status-label">TURNTABLE IDLE // TONEMASTER AT REST</span>
          </div>
          <div class="status-right">
            <span class="tag-pill dim">${lastSpun ? 'LAST SPUN' : 'STANDBY'}</span>
          </div>
        </div>

        <div class="now-spinning-body">
          <div class="sleeve-jacket-wrap">
            <div class="vinyl-disc-peek"></div>
            <div class="jacket-frame">
              ${artHtml}
            </div>
          </div>

          <div class="now-spinning-details">
            <div class="meta-headline">
              <span class="idle-badge">PREVIOUS ROTATION</span>
              ${lastSpun && lastSpun.played_at ? `<span class="time-elapsed">${formatRelativeTime(lastSpun.played_at)}</span>` : ''}
            </div>
            <h2 class="record-title">${lastSpun ? escapeHtml(lastSpun.title) : 'No recent playback'}</h2>
            <h3 class="record-artist">${lastSpun ? escapeHtml(lastSpun.artist) : 'Analog Listener active in home studio'}</h3>

            ${lastSpun ? `
              <div class="record-specs-hud">
                ${lastSpun.year ? `<div class="spec-cell"><span class="k">YEAR</span><span class="v">${lastSpun.year}</span></div>` : ''}
                ${lastSpun.label ? `<div class="spec-cell"><span class="k">LABEL</span><span class="v">${escapeHtml(lastSpun.label)}</span></div>` : ''}
                ${lastSpun.format ? `<div class="spec-cell"><span class="k">FORMAT</span><span class="v">${escapeHtml(lastSpun.format)}</span></div>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // 2. RENDER RECENT SPINS GRID
  if (recent.length === 0) {
    gridMount.innerHTML = `<div class="music-empty-state">// No listening history logged yet.</div>`;
  } else {
    gridMount.innerHTML = recent.map(item => {
      const art = item.cover_image_url || item.thumb_image_url || '';
      const thumbHtml = art
        ? `<img src="${art}" alt="${escapeHtml(item.title)}" class="record-card-thumb" loading="lazy">`
        : `<div class="card-thumb-fallback">💽</div>`;

      const timeStr = formatRelativeTime(item.played_at);

      return `
        <div class="record-card">
          <div class="record-card-sleeve">
            ${thumbHtml}
            <div class="card-vinyl-edge"></div>
          </div>
          <div class="record-card-content">
            <div class="record-card-artist">${escapeHtml(item.artist)}</div>
            <div class="record-card-title">${escapeHtml(item.title)}</div>
            <div class="record-card-meta">
              <span>${item.year || ''}</span>
              ${item.label ? `<span>· ${escapeHtml(item.label)}</span>` : ''}
              ${item.format ? `<span>· ${escapeHtml(item.format)}</span>` : ''}
            </div>
            ${timeStr ? `<div class="record-card-time"><span class="time-icon">▸</span> ${timeStr}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. RENDER ROTATION FREQUENCY HISTOGRAM
  const histMount = document.getElementById('music-histogram-mount');
  const histBadge = document.getElementById('histogram-meta-badge');
  if (histMount && recent.length > 0) {
    const albumMap = new Map();
    let rpm33Count = 0;
    let rpm45Count = 0;
    const genreMap = {};

    recent.forEach(spin => {
      const key = `${(spin.artist || 'Unknown').trim()} — ${(spin.title || 'Untitled').trim()}`;
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          artist: spin.artist || 'Unknown',
          title: spin.title || 'Untitled',
          year: spin.year || null,
          format: spin.format || 'LP',
          rpm: spin.rpm || 33,
          cover_image_url: spin.cover_image_url || spin.thumb_image_url || '',
          count: 0,
          latest_played: spin.played_at || ''
        });
      }
      const entry = albumMap.get(key);
      entry.count += 1;
      if (spin.played_at && (!entry.latest_played || spin.played_at > entry.latest_played)) {
        entry.latest_played = spin.played_at;
      }

      if (spin.rpm === 45) {
        rpm45Count += 1;
      } else {
        rpm33Count += 1;
      }

      if (spin.genre) {
        const parts = spin.genre.split(',').map(s => s.trim());
        parts.forEach(g => {
          if (g) genreMap[g] = (genreMap[g] || 0) + 1;
        });
      }
    });

    const albumList = Array.from(albumMap.values()).sort((a, b) => b.count - a.count || b.latest_played.localeCompare(a.latest_played));
    const totalSpins = recent.length;
    const maxSpins = albumList.length > 0 ? albumList[0].count : 1;

    if (histBadge) {
      histBadge.textContent = `${totalSpins} SPINS LOGGED · ${albumList.length} RELEASES`;
    }

    const pct33 = Math.round((rpm33Count / totalSpins) * 100);
    const pct45 = 100 - pct33;
    const rpmSummary = `${pct33}% 33RPM / ${pct45}% 45RPM`;

    const hudHtml = `
      <div class="histogram-telemetry-hud">
        <div class="hud-stat-cell">
          <span class="hud-stat-label">TOTAL SPINS LOGGED</span>
          <span class="hud-stat-val"><span class="val-highlight">${totalSpins}</span> SESSIONS</span>
        </div>
        <div class="hud-stat-cell">
          <span class="hud-stat-label">UNIQUE RELEASES</span>
          <span class="hud-stat-val"><span class="val-highlight">${albumList.length}</span> ALBUMS</span>
        </div>
        <div class="hud-stat-cell">
          <span class="hud-stat-label">HEAVY ROTATION LEADER</span>
          <span class="hud-stat-val" title="${escapeHtml(albumList[0].artist)} — ${escapeHtml(albumList[0].title)}">
            <span class="val-highlight">${albumList[0].count}x</span> ${escapeHtml(albumList[0].artist)}
          </span>
        </div>
        <div class="hud-stat-cell">
          <span class="hud-stat-label">SPEED PROFILE</span>
          <span class="hud-stat-val">${rpmSummary}</span>
        </div>
      </div>
    `;

    const rowsHtml = albumList.map((item, idx) => {
      const pctOfTotal = ((item.count / totalSpins) * 100).toFixed(1);
      const barFillPct = Math.max(8, Math.round((item.count / maxSpins) * 100));
      const rankStr = String(idx + 1).padStart(2, '0');

      return `
        <div class="histogram-row">
          <div class="histogram-row-header">
            <div class="histogram-row-meta">
              <span class="histogram-rank">#${rankStr}</span>
              <div class="histogram-title-wrap">
                <span class="histogram-record-title">${escapeHtml(item.title)}</span>
                <span class="histogram-record-artist">// ${escapeHtml(item.artist)}</span>
              </div>
            </div>
            <div class="histogram-row-metrics">
              <span class="histogram-count-badge">${item.count} ${item.count === 1 ? 'SPIN' : 'SPINS'}</span>
              <span class="histogram-pct">${pctOfTotal}%</span>
            </div>
          </div>
          <div class="histogram-bar-track">
            <div class="histogram-bar-fill" style="width: ${barFillPct}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    histMount.innerHTML = `
      ${hudHtml}
      <div class="histogram-card">
        <div class="histogram-list">
          ${rowsHtml}
        </div>
      </div>
    `;
  } else if (histMount) {
    histMount.innerHTML = `<div class="music-empty-state">// No listening telemetry available.</div>`;
  }

  // Auto-refresh poll every 30 seconds while user is on #music
  musicPollTimer = setInterval(async () => {
    const curHash = window.location.hash.split('/')[0];
    if (curHash !== '#music' && curHash !== '#playlists') {
      clearInterval(musicPollTimer);
      return;
    }
    const fresh = await fetchMusicData();
    if (fresh && fresh.now_playing) {
      if (!np || !np.active || np.title !== fresh.now_playing.title || np.side !== fresh.now_playing.side) {
        renderMusic();
      }
    } else if (np && np.active) {
      renderMusic();
    }
  }, 30000);
}

// Backwards-compatible alias for existing links
const renderPlaylists = renderMusic;

// --- RENDER 4: PRINTS PAGE ---
function renderPrints() {
  const allImages = [];
  const addedSrcs = new Set();

  state.posts.forEach(post => {
    const images = parseImagesFromHTML(post.content);
    images.forEach(img => {
      if (!addedSrcs.has(img.src)) {
        addedSrcs.add(img.src);
        allImages.push({ src: img.src, alt: img.alt, title: post.title });
      }
    });
  });

  const gallerySelection = allImages.slice(0, 12);

  let html = `
    <div class="page-container">
      <h1>prints</h1>
      <div class="page-content">
        <p>all of the photos (probably more like most) are available as physical prints. each print is individually printed at home by me, on premium archival photo paper, and is signed, dated, and numbered on the reverse side.</p>
        <p>i can do up to 13x19 at home, but if you want a custom size, let me know and i can get it done.</p>
      </div>
      
      <div class="print-specifications">
        <div class="spec-card">
          <h3>small format</h3>
          <p class="price">$15</p>
          <p>8.5" x 11" dimensions</p>
          <p style="margin-top:0.3rem">includes 0.5" border for framing</p>
        </div>
        <div class="spec-card">
          <h3>large format</h3>
          <p class="price">$25</p>
          <p>13" x 19" dimensions</p>
          <p style="margin-top:0.3rem">includes 1.0" border for framing</p>
        </div>
      </div>
      
      <h2 class="print-gallery-title">select a frame for print inquiry</h2>
      <div class="print-grid">
  `;

  gallerySelection.forEach(img => {
    html += `
      <div class="print-photo-card" data-src="${img.src}" data-title="${img.title}">
        <img src="${img.src}" alt="${img.alt}" loading="lazy">
        <div class="print-photo-overlay">
          <h4>${img.title}</h4>
          <span>Inquire Print</span>
        </div>
      </div>
    `;
  });

  html += `
      </div>
      <div style="font-family:var(--font-mono); font-size:0.75rem; text-align:center; color:var(--text-muted); margin-top: 3rem;">
        Or write to me directly at <a href="mailto:ryan@thelendingside.com" style="text-decoration:underline; color:var(--accent-color)">ryan@thelendingside.com</a>
      </div>
    </div>
  `;

  elements.viewContent.innerHTML = html;

  const printCards = elements.viewContent.querySelectorAll('.print-photo-card');
  printCards.forEach(card => {
    card.addEventListener('click', () => {
      const src = card.getAttribute('data-src');
      const title = card.getAttribute('data-title');
      openInquiry(src, title);
    });
  });
}

// --- RENDER 5: ABOUT PAGE ---
function renderAbout() {
  let html = `
    <div class="page-container">
      <h1>about</h1>
      <div class="page-content">
        <p>all images & words are mine.</p>
        <p>thanks for reading.</p>
        <p>ryan at thelendingside.com</p>
        
        <div class="about-signature">
          — ryan.
        </div>
      </div>
    </div>
  `;

  elements.viewContent.innerHTML = html;
}

// --- LIGHTBOX CONTROLS ---

function openLightboxForPost(postIdx, imgIdx) {
  const post = state.posts[postIdx];
  const images = parseImagesFromHTML(post.content);

  if (post.featured_image) {
    const isFeaturedIncluded = images.some(img => img.src === post.featured_image);
    if (!isFeaturedIncluded) {
      images.unshift({ src: post.featured_image, alt: post.title, title: post.title });
    }
  }

  openLightboxGlobal(images, imgIdx);
}

function openLightboxGlobal(imagesList, index) {
  state.lightboxImages = imagesList;
  state.lightboxIndex = index;

  updateLightboxContent();
  elements.lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function updateLightboxContent() {
  if (state.lightboxImages.length === 0) return;
  const currentImg = state.lightboxImages[state.lightboxIndex];

  elements.lightboxImg.src = currentImg.src;
  elements.lightboxImg.alt = currentImg.alt;
  elements.lightboxTitle.textContent = currentImg.title.toLowerCase();

  if (elements.lightboxExif) {
    elements.lightboxExif.textContent = '';
  }

  const hasMultiple = state.lightboxImages.length > 1;
  elements.lightboxPrev.style.display = hasMultiple ? 'flex' : 'none';
  elements.lightboxNext.style.display = hasMultiple ? 'flex' : 'none';
}

function closeLightbox() {
  elements.lightbox.classList.remove('active');
  document.body.style.overflow = '';
  elements.lightboxImg.src = '';
}

function prevLightbox() {
  if (state.lightboxImages.length <= 1) return;
  state.lightboxIndex = (state.lightboxIndex - 1 + state.lightboxImages.length) % state.lightboxImages.length;
  updateLightboxContent();
}

function nextLightbox() {
  if (state.lightboxImages.length <= 1) return;
  state.lightboxIndex = (state.lightboxIndex + 1) % state.lightboxImages.length;
  updateLightboxContent();
}

// --- PRINT INQUIRY CONTROLS ---

function openInquiry(src, title) {
  state.selectedPrintImage = { src, title };
  elements.inquiryImg.src = src;
  elements.inquiryPhotoTitle.textContent = title;
  elements.inquiryModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeInquiry() {
  elements.inquiryModal.classList.remove('active');
  document.body.style.overflow = '';
}

function submitInquiry(e) {
  e.preventDefault();

  const size = elements.printSize.value;
  const name = elements.clientName.value;
  const email = elements.clientEmail.value;
  const notes = elements.clientNotes.value;
  const photoTitle = state.selectedPrintImage.title;

  const recipient = "ryan@thelendingside.com";
  const subject = encodeURIComponent(`Print Inquiry: "${photoTitle}"`);

  const bodyText = `Hi Ryan,

I am writing to inquire about a physical print of your photograph: "${photoTitle}".

Inquiry Details:
- Selected Dimensions: ${size}
- Client Name: ${name}
- Return Email: ${email}

Additional Notes:
${notes || 'No extra notes provided.'}

Thank you!`;

  const body = encodeURIComponent(bodyText);
  window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;

  elements.inquiryForm.reset();
  closeInquiry();
}

// Start Application
window.addEventListener('DOMContentLoaded', init);
