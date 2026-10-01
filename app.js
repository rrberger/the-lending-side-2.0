// State Management
const state = {
  posts: [],
  pages: [],
  exifMap: {},
  currentViewMode: localStorage.getItem('viewMode') || 'film_strip',
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
    case '#admin':
      elements.layoutSwitcher.style.display = 'none';
      renderAdminDashboard();
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
  if (state.currentViewMode === 'film_strip') {
    renderFilmStripView();
  } else if (state.currentViewMode === 'journal') {
    renderJournalView();
  } else {
    renderIndexView();
  }
}

// A. Film_strip horizontal scroll view
function renderFilmStripView() {
  let html = `<div class="film_strip-container" id="film_strip-canvas">`;
  
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
      <section class="film_strip-post" data-post-idx="${postIdx}">
        <div class="film_strip-meta">
          <span class="post-date-mono">[ ${formattedDate} ]</span>
          <h2>${post.title}</h2>
          <div class="excerpt">${post.excerpt || ''}</div>
          <a href="#post/${post.slug}" class="read-more-btn">READ_ENTRY</a>
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
  
  html += `</div>`;
  elements.viewContent.innerHTML = html;
  
  // Convert vertical scroll wheel to horizontal
  const canvas = document.getElementById('film_strip-canvas');
  if (canvas) {
    canvas.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        canvas.scrollLeft += e.deltaY * 1.5;
        e.preventDefault();
      }
    }, { passive: false });
  }
  
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


// --- CMS ADMIN DASHBOARD ---

function renderAdminDashboard() {
  let html = `
    <div class="admin-container">
      <div class="admin-header">
        <h1>CMS // POSTS_DATABASE</h1>
        <div class="admin-actions">
          <button class="btn btn-primary" id="btn-new-post">[ COMPOSE_NEW_POST ]</button>
        </div>
      </div>
      
      <div class="minimal-panel" style="margin-bottom: 2rem; margin-top: 0;">
        <div class="panel-header">system_log</div>
        <span style="color:var(--text-muted)">database_status:</span> ok // 
        <span style="color:var(--text-muted)">posts_count:</span> ${state.posts.length} // 
        <span style="color:var(--text-muted)">exif_count:</span> ${Object.keys(state.exifMap).length}
      </div>
      
      <div class="admin-list">
  `;
  
  state.posts.forEach(post => {
    const dateStr = new Date(post.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    html += `
      <div class="admin-post-row" data-id="${post.id}">
        <div>
          <h3 class="admin-post-title">${post.title}</h3>
          <span class="admin-post-date">${dateStr} | slug: ${post.slug}</span>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-edit" data-id="${post.id}">EDIT</button>
          <button class="btn btn-danger btn-delete" data-id="${post.id}">DELETE</button>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  elements.viewContent.innerHTML = html;
  
  // Bind Admin Dashboard Button Click Listeners
  document.getElementById('btn-new-post').addEventListener('click', () => {
    openPostEditor(null);
  });
  
  elements.viewContent.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = parseInt(btn.getAttribute('data-id'));
      const post = state.posts.find(p => p.id === postId);
      openPostEditor(post);
    });
  });
  
  elements.viewContent.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = parseInt(btn.getAttribute('data-id'));
      const post = state.posts.find(p => p.id === postId);
      showConfirm(`ARE YOU SURE YOU WANT TO PERMANENTLY WIPE POST: "${post.title.toUpperCase()}"?`, (confirmed) => {
        if (confirmed) {
          deletePost(postId);
        }
      });
    });
  });
}

// Delete Post API Call
async function deletePost(postId) {
  try {
    const response = await fetch('/api/posts/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId })
    });
    
    const result = await response.json();
    if (result.status === 'success') {
      alert('DATABASE ACTION SUCCESSFUL: POST WIPED.');
      await fetchDatabase();
      renderAdminDashboard();
    } else {
      alert('API ERROR: ' + result.error);
    }
  } catch (error) {
    console.error('Delete call failed:', error);
    alert('SERVER CONNECTION REFUSED. Ensure python server.py is running.');
  }
}

// Open Form Post Editor
function openPostEditor(post = null) {
  state.activeEditorPost = post;
  state.editorUploadedImages = post ? parseImagesFromHTML(post.content).map(img => img.src) : [];
  
  const isNew = !post;
  const titleVal = post ? post.title : '';
  const slugVal = post ? post.slug : '';
  const excerptVal = post ? post.excerpt : '';
  const contentVal = post ? post.content : '';
  
  // Format Date for Date HTML input (yyyy-MM-dd)
  let dateVal = new Date().toISOString().split('T')[0];
  if (post && post.date) {
    dateVal = new Date(post.date).toISOString().split('T')[0];
  }
  
  let html = `
    <div class="admin-container">
      <div class="admin-header">
        <h1>${isNew ? 'CMS // COMPOSE_NEW_ENTRY' : 'CMS // EDIT_ENTRY'}</h1>
        <button class="btn" id="btn-editor-back">&larr; ABORT</button>
      </div>
      
      <div class="minimal-panel">
        <div class="panel-header">entry_editor</div>
        <form class="editor-form" id="editor-form">
          <div class="editor-row">
            <div class="form-group">
              <label for="edit-title">Post Title</label>
              <input type="text" id="edit-title" value="${titleVal.replace(/"/g, '&quot;')}" placeholder="there's no way out but through" required>
            </div>
            <div class="form-group">
              <label for="edit-slug">URL Slug</label>
              <input type="text" id="edit-slug" value="${slugVal}" placeholder="theres-no-way-out-but-through" required>
            </div>
          </div>
          
          <div class="editor-row">
            <div class="form-group">
              <label for="edit-date">Post Date</label>
              <input type="date" id="edit-date" value="${dateVal}" required>
            </div>
            <div class="form-group">
              <label for="edit-featured">Featured Image URL (Index cover)</label>
              <select id="edit-featured">
                <option value="">[ Select an image below after upload ]</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label for="edit-excerpt">Short Summary Excerpt</label>
            <input type="text" id="edit-excerpt" value="${excerptVal.replace(/"/g, '&quot;')}" placeholder="Brief intro to display on lists...">
          </div>
          
          <!-- Image upload Dropzone -->
          <div class="form-group">
            <label>Upload photography assets</label>
            <div class="upload-zone" id="upload-zone">
              <p>DRAG & DROP PHOTOGRAPH FILES HERE or CLICK TO CHOOSE</p>
              <input type="file" id="file-uploader" multiple accept="image/*" style="display:none;">
            </div>
            <div class="uploaded-images-preview" id="upload-preview-container">
              <!-- Render uploaded images manager here -->
            </div>
          </div>
          
          <div class="form-group">
            <label for="edit-content">Post content (HTML / Gutenberg format)</label>
            <textarea id="edit-content" rows="12" placeholder="Write prose paragraphs <p>...</p> and drag images above to insert reference tags..." required>${contentVal}</textarea>
          </div>
          
          <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:1rem;">
            <button type="button" class="btn" id="btn-editor-cancel">DISCARD_CHANGES</button>
            <button type="submit" class="btn btn-primary">[ SAVE_AND_COMMIT_ENTRY ]</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  elements.viewContent.innerHTML = html;
  
  // Set up uploader previews and bindings
  updateUploaderPreviews();
  
  // Auto slug generation helper
  const titleInput = document.getElementById('edit-title');
  const slugInput = document.getElementById('edit-slug');
  titleInput.addEventListener('input', () => {
    if (isNew) {
      slugInput.value = titleInput.value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }
  });
  
  // Back & Discard buttons
  document.getElementById('btn-editor-back').addEventListener('click', confirmDiscard);
  document.getElementById('btn-editor-cancel').addEventListener('click', confirmDiscard);
  
  function confirmDiscard() {
    showConfirm("ABORT EDITOR? ALL UNSAVED CHANGES WILL BE LOST.", (confirmed) => {
      if (confirmed) {
        renderAdminDashboard();
      }
    });
  }
  
  // Drag & drop file uploads trigger
  const uploadZone = document.getElementById('upload-zone');
  const fileUploader = document.getElementById('file-uploader');
  
  uploadZone.addEventListener('click', () => fileUploader.click());
  
  fileUploader.addEventListener('change', () => {
    handleFileUpload(fileUploader.files);
  });
  
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });
  
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFileUpload(e.dataTransfer.files);
  });
  
  // Form submission handler
  document.getElementById('editor-form').addEventListener('submit', commitPostEdits);
}

// Handle local image file upload through boundary API
async function handleFileUpload(files) {
  if (files.length === 0) return;
  
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  
  try {
    const uploadZone = document.getElementById('upload-zone');
    uploadZone.querySelector('p').textContent = "UPLOADING FILE STRUCTURES... [▉]";
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    if (result.status === 'success') {
      result.filenames.forEach(filename => {
        const imagePath = (filename.startsWith('http://') || filename.startsWith('https://'))
          ? filename
          : `images/${filename}`;
        if (!state.editorUploadedImages.includes(imagePath)) {
          state.editorUploadedImages.push(imagePath);
        }
      });
      alert('UPLOAD SUCCESSFUL.');
      updateUploaderPreviews();
    } else {
      alert('UPLOAD ERROR: ' + result.error);
    }
    
    uploadZone.querySelector('p').textContent = "DRAG & DROP PHOTOGRAPH FILES HERE or CLICK TO CHOOSE";
  } catch (error) {
    console.error('Upload failed:', error);
    alert('UPLOADER FAILURE. Ensure python server.py is running.');
    document.getElementById('upload-zone').querySelector('p').textContent = "DRAG & DROP PHOTOGRAPH FILES HERE or CLICK TO CHOOSE";
  }
}

// Render uploaded images metadata form list in the editor
function updateUploaderPreviews() {
  const container = document.getElementById('upload-preview-container');
  const featuredSelect = document.getElementById('edit-featured');
  const currentFeatured = state.activeEditorPost ? state.activeEditorPost.featured_image : '';
  
  // Save current values to restore
  const previousFeaturedSelect = featuredSelect.value || currentFeatured;
  
  // Reset select
  featuredSelect.innerHTML = `<option value="">[ Select an image below after upload ]</option>`;
  container.innerHTML = '';
  
  if (state.editorUploadedImages.length === 0) {
    container.innerHTML = `<div style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase;">No images files linked yet.</div>`;
    return;
  }
  
  state.editorUploadedImages.forEach((imgSrc, idx) => {
    const filename = imgSrc.split('/').pop();
    const exif = state.exifMap[filename] || { camera: '', focal_length: '', aperture: '', shutter_speed: '', iso: '' };
    
    // Add option to featured dropdown
    const option = document.createElement('option');
    option.value = imgSrc;
    option.textContent = filename;
    if (imgSrc === previousFeaturedSelect) {
      option.selected = true;
    }
    featuredSelect.appendChild(option);
    
    // Create preview row with EXIF form fields
    const card = document.createElement('div');
    card.className = 'minimal-panel';
    card.style.marginTop = '1rem';
    card.style.padding = '1rem';
    card.style.display = 'flex';
    card.style.gap = '1.5rem';
    
    card.innerHTML = `
      <div style="width: 120px; flex-shrink: 0;">
        <img src="${imgSrc}" style="width:100%; aspect-ratio:3/2; object-fit:cover; border:1px solid var(--border-color);" alt="">
        <button type="button" class="btn btn-copy-ref" data-src="${imgSrc}" style="width:100%; font-size:0.55rem; padding:0.3rem 0; margin-top:0.4rem;">[ COPY_HTML ]</button>
        <button type="button" class="btn btn-danger btn-remove-image" data-src="${imgSrc}" style="width:100%; font-size:0.55rem; padding:0.3rem 0; margin-top:0.2rem;">REMOVE</button>
      </div>
      <div style="flex-grow: 1; display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.6rem;">
        <div class="form-group">
          <label style="font-size:0.55rem;">Camera Body</label>
          <input type="text" class="exif-input" data-file="${filename}" data-key="camera" value="${exif.camera}" placeholder="X-Pro3 / Canon 80D">
        </div>
        <div class="form-group">
          <label style="font-size:0.55rem;">Focal Length</label>
          <input type="text" class="exif-input" data-file="${filename}" data-key="focal_length" value="${exif.focal_length}" placeholder="23mm / 16mm">
        </div>
        <div class="form-group">
          <label style="font-size:0.55rem;">Aperture</label>
          <input type="text" class="exif-input" data-file="${filename}" data-key="aperture" value="${exif.aperture}" placeholder="f/2.8 / f/8">
        </div>
        <div class="form-group">
          <label style="font-size:0.55rem;">Shutter Speed</label>
          <input type="text" class="exif-input" data-file="${filename}" data-key="shutter_speed" value="${exif.shutter_speed}" placeholder="1/125s / 0.3s">
        </div>
        <div class="form-group">
          <label style="font-size:0.55rem;">ISO Speed</label>
          <input type="text" class="exif-input" data-file="${filename}" data-key="iso" value="${exif.iso}" placeholder="1600 / 100">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Bind Copy HTML reference helper
  container.querySelectorAll('.btn-copy-ref').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const src = btn.getAttribute('data-src');
      const tag = `<figure class="wp-block-image size-large"><img src="${src}" alt="" /></figure>`;
      navigator.clipboard.writeText(tag).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "COPIED!";
        setTimeout(() => btn.textContent = originalText, 1500);
      });
    });
  });
  
  // Bind remove image button
  container.querySelectorAll('.btn-remove-image').forEach(btn => {
    btn.addEventListener('click', () => {
      const src = btn.getAttribute('data-src');
      state.editorUploadedImages = state.editorUploadedImages.filter(path => path !== src);
      updateUploaderPreviews();
    });
  });
}

// Save post to Python server
async function commitPostEdits(e) {
  e.preventDefault();
  
  const title = document.getElementById('edit-title').value;
  const slug = document.getElementById('edit-slug').value;
  const dateVal = document.getElementById('edit-date').value;
  const featured_image = document.getElementById('edit-featured').value;
  const excerpt = document.getElementById('edit-excerpt').value;
  const content = document.getElementById('edit-content').value;
  
  // Format dates: add timezone matching standard wordpress output (e.g. 2023-01-29T13:41:54-05:00)
  const date = new Date(dateVal + 'T12:00:00').toISOString().split('.')[0] + '-05:00';
  
  const postObject = {
    id: state.activeEditorPost ? state.activeEditorPost.id : null,
    title,
    slug,
    date,
    modified: new Date().toISOString().split('.')[0] + '-05:00',
    featured_image: featured_image || null,
    excerpt: excerpt ? `<p>${excerpt}</p>` : '',
    content,
    url: `http://thelendingside.com/${dateVal.replace(/-/g, '/')}/${slug}/`
  };
  
  // Collect EXIF values from form inputs
  const exifCollection = {};
  const exifInputs = document.querySelectorAll('.exif-input');
  exifInputs.forEach(input => {
    const filename = input.getAttribute('data-file');
    const key = input.getAttribute('data-key');
    const val = input.value.trim();
    
    if (val) {
      if (!exifCollection[filename]) {
        exifCollection[filename] = {};
      }
      exifCollection[filename][key] = val;
    }
  });
  
  const payload = {
    post: postObject,
    exif: exifCollection
  };
  
  try {
    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (result.status === 'success') {
      alert('DATABASE COMMIT SUCCESSFUL: POST RECORDED.');
      await fetchDatabase(); // Reload state
      window.location.hash = '#admin';
    } else {
      alert('API ERROR: ' + result.error);
    }
  } catch (error) {
    console.error('Post save failed:', error);
    alert('SAVE REJECTED. Server connection failed.');
  }
}

// Custom Terminal Confirmation Modal
function showConfirm(message, callback) {
  const modal = document.getElementById('confirm-modal');
  const msgEl = document.getElementById('confirm-message');
  const btnYes = document.getElementById('btn-confirm-yes');
  const btnNo = document.getElementById('btn-confirm-no');
  
  msgEl.textContent = message.toUpperCase();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  const newBtnYes = btnYes.cloneNode(true);
  const newBtnNo = btnNo.cloneNode(true);
  btnYes.parentNode.replaceChild(newBtnYes, btnYes);
  btnNo.parentNode.replaceChild(newBtnNo, btnNo);
  
  newBtnYes.addEventListener('click', () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    callback(true);
  });
  
  newBtnNo.addEventListener('click', () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    callback(false);
  });
}

// Start Application
window.addEventListener('DOMContentLoaded', init);
