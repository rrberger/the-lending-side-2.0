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
  menuLinks: document.querySelectorAll('.menu-link, .mobile-nav-link'),
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
  
  switch(hash) {
    case '#home':
    case '':
      elements.layoutSwitcher.style.display = 'block';
      renderHome();
      break;
    case '#playlists':
      elements.layoutSwitcher.style.display = 'none';
      renderPlaylists();
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
    if (target === mainHash) {
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
}

// --- RENDER 3: PLAYLISTS PAGE ---
function renderPlaylists() {
  let html = `
    <div class="page-container">
      <h1>playlists</h1>
      <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:2rem; max-width:650px; line-height:1.6;">
        music is the skeleton that holds the imagery together. these are the songs and soundscapes that were looping in my headphones while developing these stories and capturing these frames.
      </p>
      
      <div style="border: 1px dashed var(--border-color); padding: 3rem 2rem; border-radius: 4px; text-align: center; max-width: 650px; background: rgba(255,255,255,0.01); margin-top: 1rem;">
        <p style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); margin: 0; text-transform: uppercase; letter-spacing: 0.15em;">
          // Curating tapes... coming soon
        </p>
      </div>
    </div>
  `;
  elements.viewContent.innerHTML = html;
}

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
        <p>everything i capture and write here is available as a physical print. each piece is individually printed at home by me, on premium archival photo paper, and is signed, dated, and numbered on the reverse side.</p>
        <p>i inspect every single frame myself to ensure the grain structure, depth of shadows, and tones are translated correctly from digital screen to ink on paper.</p>
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
  const aboutPage = state.pages.find(p => p.slug === 'contact') || {
    title: "about",
    content: "<p>all images are analog & all words are mine.</p><p>thanks for reading.</p><p>ryan at thelendingside.com</p>"
  };
  
  let html = `
    <div class="page-container">
      <h1>${aboutPage.title.toLowerCase()}</h1>
      <div class="page-content">
        ${aboutPage.content}
        
        <div class="about-signature">
          — ryan.
        </div>
        
        <div class="about-contact-links">
          <a href="mailto:ryan@thelendingside.com">Email Me</a>
          <a href="https://github.com/lawle" target="_blank" rel="noopener">GitHub</a>
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
