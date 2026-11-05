/**
 * CodeAlpha E-Commerce Store - Core Application Logic
 */

const app = {
  products: [],
  categories: [],
  currentCategory: 'All',
  searchQuery: '',
  currentSort: 'featured',
  priceRange: 1500,
  inStockOnly: false,
  wishlist: new Set(),
  activeProductModalId: null,

  async init() {
    this.loadWishlist();
    this.bindGlobalEvents();

    // Initialize modules
    await window.auth.init();
    await window.cart.init();

    // Load store data
    await this.loadCategories();
    await this.loadProducts();

    // Check URL hash for direct links (e.g., #product/2 or #orders)
    this.handleRouting();
    window.addEventListener('hashchange', () => this.handleRouting());
  },

  loadWishlist() {
    try {
      const saved = localStorage.getItem('ca_wishlist');
      if (saved) {
        this.wishlist = new Set(JSON.parse(saved));
      }
    } catch (e) {
      this.wishlist = new Set();
    }
    this.updateWishlistBadge();
  },

  toggleWishlist(productId) {
    const id = Number(productId);
    if (this.wishlist.has(id)) {
      this.wishlist.delete(id);
      this.showToast('Removed from wishlist', 'info');
    } else {
      this.wishlist.add(id);
      this.showToast('Added to wishlist!', 'success');
    }
    localStorage.setItem('ca_wishlist', JSON.stringify(Array.from(this.wishlist)));
    this.updateWishlistBadge();
    this.renderProducts();
  },

  updateWishlistBadge() {
    const badge = document.getElementById('wishlist-badge');
    if (badge) {
      badge.textContent = this.wishlist.size;
      badge.style.display = this.wishlist.size > 0 ? 'inline-flex' : 'none';
    }
  },

  async loadCategories() {
    try {
      const res = await window.api.getCategories();
      this.categories = res.categories || [];
      this.renderCategoryPills();
    } catch (e) {
      console.error(e);
    }
  },

  async loadProducts() {
    const grid = document.getElementById('products-grid');
    if (grid) {
      grid.innerHTML = Array(6).fill(0).map(() => `
        <div class="product-card skeleton-card">
          <div class="skeleton-img"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
          <div class="skeleton-btn"></div>
        </div>
      `).join('');
    }

    try {
      const res = await window.api.getProducts({
        category: this.currentCategory,
        search: this.searchQuery,
        sort: this.currentSort,
        maxPrice: this.priceRange,
        inStock: this.inStockOnly
      });

      this.products = res.products || [];
      this.renderProducts();
    } catch (err) {
      console.error(err);
      if (grid) {
        grid.innerHTML = `<div class="error-msg">Failed to load products: ${err.message}</div>`;
      }
    }
  },

  renderCategoryPills() {
    const container = document.getElementById('category-pills-list');
    if (!container) return;

    const totalCount = this.categories.reduce((acc, c) => acc + c.count, 0);
    const allPill = `
      <button type="button" class="category-pill ${this.currentCategory === 'All' ? 'active' : ''}" data-cat="All">
        <span>All Products</span>
        <small class="pill-count">${totalCount}</small>
      </button>
    `;

    const catPills = this.categories.map(c => `
      <button type="button" class="category-pill ${this.currentCategory === c.category ? 'active' : ''}" data-cat="${c.category}">
        <span>${c.category}</span>
        <small class="pill-count">${c.count}</small>
      </button>
    `).join('');

    container.innerHTML = allPill + catPills;

    container.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentCategory = btn.dataset.cat;
        this.renderCategoryPills();
        this.loadProducts();
      });
    });
  },

  renderProducts() {
    const grid = document.getElementById('products-grid');
    const countEl = document.getElementById('product-count-display');
    const emptyState = document.getElementById('no-products-state');

    if (countEl) {
      countEl.innerHTML = `CATALOG // <strong>${this.products.length}</strong> VERIFIED HARDWARE UNITS`;
    }

    if (!grid) return;

    if (this.products.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    grid.innerHTML = this.products.map(prod => {
      const isWishlisted = this.wishlist.has(prod.id);
      const discount = prod.original_price ? Math.round(((prod.original_price - prod.price) / prod.original_price) * 100) : null;
      const isOutOfStock = prod.stock_count <= 0;

      return `
        <article class="product-card" data-id="${prod.id}">
          <div class="card-media-wrapper">
            ${prod.badge ? `<span class="product-badge badge-${prod.badge.toLowerCase().replace(/[^a-z0-9]/g, '-')}">${prod.badge}</span>` : ''}
            ${discount ? `<span class="discount-pill">-${discount}%</span>` : ''}
            
            <button type="button" class="wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="app.toggleWishlist(${prod.id})" aria-label="Save to wishlist">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? '#ef4444' : 'none'}" stroke="${isWishlisted ? '#ef4444' : 'currentColor'}" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>

            <img src="${prod.image}" alt="${prod.name}" class="product-card-img" loading="lazy" onclick="app.openProductModal(${prod.id})">
            
            <button type="button" class="quick-view-btn" onclick="app.openProductModal(${prod.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Quick Details
            </button>
          </div>

          <div class="card-content">
            <div class="card-header-meta">
              <div class="card-badges-left">
                <span class="product-sku-tag">#ALP-${String(prod.id).padStart(3, '0')}</span>
                <span class="product-category-tag">${prod.category}</span>
              </div>
              <div class="card-rating">
                <svg class="star-icon" width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span class="rating-num">${prod.rating.toFixed(1)}</span>
                <span class="rating-count">(${prod.reviews_count})</span>
              </div>
            </div>

            <h3 class="product-title" onclick="app.openProductModal(${prod.id})">${prod.name}</h3>
            <p class="product-tagline">${prod.tagline || prod.description.substring(0, 75) + '...'}</p>

            ${!isOutOfStock && prod.stock_count < 10 ? `
              <div class="card-urgency-note">
                <span class="urgency-pulse"></span>
                <span>Only ${prod.stock_count} units remaining</span>
              </div>
            ` : ''}

            <div class="card-footer">
              <div class="price-container">
                <span class="current-price">$${prod.price.toFixed(2)}</span>
                ${prod.original_price ? `<span class="original-price">$${prod.original_price.toFixed(2)}</span>` : ''}
              </div>

              <div class="card-action-group">
                <button type="button" class="add-to-cart-btn ${isOutOfStock ? 'disabled' : ''}" 
                  ${isOutOfStock ? 'disabled' : ''} 
                  onclick="cart.addItem(${prod.id}, 1)">
                  ${isOutOfStock ? 'Sold Out' : `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="21" r="1"></circle>
                      <circle cx="20" cy="21" r="1"></circle>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    <span>Add</span>
                  `}
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  },

  async openProductModal(productId) {
    const modal = document.getElementById('product-detail-modal');
    const content = document.getElementById('product-detail-content');
    if (!modal || !content) return;

    this.activeProductModalId = productId;
    window.location.hash = `#product/${productId}`;

    content.innerHTML = `
      <div class="modal-loading-spinner">
        <div class="spinner"></div>
        <p>Loading product details...</p>
      </div>
    `;
    this.openModal('product-detail-modal');

    try {
      const res = await window.api.getProductById(productId);
      const prod = res.product;

      const discount = prod.original_price ? Math.round(((prod.original_price - prod.price) / prod.original_price) * 100) : null;
      const isWishlisted = this.wishlist.has(prod.id);
      const isOutOfStock = prod.stock_count <= 0;

      const sku = `ALP-${String(prod.id).padStart(3, '0')}`;

      content.innerHTML = `
        <div class="modal-breadcrumb">
          <span>CATALOG</span>
          <span class="bc-sep">/</span>
          <span>${prod.category.toUpperCase()}</span>
          <span class="bc-sep">/</span>
          <strong class="text-lime">#${sku}</strong>
        </div>

        <div class="product-detail-grid">
          <!-- Gallery Column -->
          <div class="product-gallery-section">
            <div class="main-image-display">
              <img id="detail-active-img" src="${prod.image}" alt="${prod.name}">
              ${prod.badge ? `<span class="product-badge badge-${prod.badge.toLowerCase().replace(/[^a-z0-9]/g, '-')}">${prod.badge}</span>` : ''}
              ${discount ? `<span class="discount-pill">-${discount}% OFF</span>` : ''}
            </div>
            ${prod.gallery && prod.gallery.length > 1 ? `
              <div class="thumbnails-track">
                ${prod.gallery.map((imgUrl, idx) => `
                  <button type="button" class="thumb-btn ${idx === 0 ? 'active' : ''}" onclick="app.setDetailActiveImage('${imgUrl}', this)">
                    <img src="${imgUrl}" alt="Thumbnail ${idx + 1}">
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <!-- Verified Hardware Seal -->
            <div class="hardware-authenticity-seal">
              <div class="seal-icon">✓</div>
              <div class="seal-text">
                <strong>VERIFIED ALPHA HARDWARE</strong>
                <small>Unit Serial No: SN-${prod.id * 9412} • Factory Calibrated</small>
              </div>
            </div>
          </div>

          <!-- Info Column -->
          <div class="product-info-section">
            <div class="detail-category-row">
              <div class="detail-meta-left">
                <button type="button" class="sku-copy-pill" onclick="app.copyToClipboard('${sku}', 'Product SKU #${sku} copied to clipboard!')" title="Click to copy SKU">
                  <span class="sku-label">PRODUCT NO:</span>
                  <strong>#${sku}</strong>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <span class="product-category-tag">${prod.category}</span>
              </div>
              <div class="stock-indicator ${isOutOfStock ? 'out-of-stock' : (prod.stock_count < 10 ? 'low-stock' : 'in-stock')}">
                <span class="stock-dot"></span>
                <span>${isOutOfStock ? 'Out of Stock' : (prod.stock_count < 10 ? `Only ${prod.stock_count} left!` : `In Stock (${prod.stock_count} units)`)}</span>
              </div>
            </div>

            <h1 class="detail-title">${prod.name}</h1>
            <p class="detail-tagline">${prod.tagline || ''}</p>

            <div class="detail-rating-row">
              <div class="stars-flex">
                ${[1, 2, 3, 4, 5].map(star => `
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="${star <= Math.round(prod.rating) ? '#f59e0b' : '#334155'}" stroke="${star <= Math.round(prod.rating) ? '#f59e0b' : '#475569'}">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                `).join('')}
              </div>
              <span class="detail-rating-score">${prod.rating.toFixed(1)} / 5.0</span>
              <span class="detail-reviews-link" onclick="app.switchDetailTab('reviews')">(${prod.reviews_count} verified reviews)</span>
            </div>

            <div class="detail-price-box">
              <div class="detail-price-group">
                <span class="detail-current-price">$${prod.price.toFixed(2)}</span>
                ${prod.original_price ? `
                  <span class="detail-original-price">$${prod.original_price.toFixed(2)}</span>
                  <span class="save-tag">You save $${(prod.original_price - prod.price).toFixed(2)}</span>
                ` : ''}
              </div>
              <div class="tax-shipping-note">Free standard shipping on orders $99+ • 30-Day Money Back</div>
            </div>

            <!-- Delivery & Service Guarantee Box -->
            <div class="detail-delivery-banner">
              <div class="delivery-banner-item">
                <span class="banner-icon">🚀</span>
                <div>
                  <strong>Guaranteed Express Dispatch</strong>
                  <small>Order within next 2 hours for same-day warehouse release</small>
                </div>
              </div>
            </div>

            <!-- Action Form -->
            <div class="detail-purchase-controls">
              <div class="quantity-picker">
                <label for="detail-qty-input">Quantity:</label>
                <div class="quantity-control large">
                  <button type="button" class="qty-btn" onclick="app.adjustDetailQty(-1)">-</button>
                  <input type="number" id="detail-qty-input" value="1" min="1" max="${prod.stock_count}" readonly>
                  <button type="button" class="qty-btn" onclick="app.adjustDetailQty(1)">+</button>
                </div>
              </div>

              <div class="detail-btn-row">
                <button type="button" class="btn btn-brutalist btn-lime btn-add-cart-detail" ${isOutOfStock ? 'disabled' : ''} onclick="app.addCurrentDetailToCart(${prod.id})">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                  </svg>
                  <span>ADD TO CART</span>
                </button>

                <button type="button" class="btn btn-brutalist btn-white btn-buy-now" ${isOutOfStock ? 'disabled' : ''} onclick="app.instantBuyNow(${prod.id})">
                  ⚡ INSTANT DISPATCH
                </button>

                <button type="button" class="btn btn-brutalist btn-white wishlist-toggle-btn ${isWishlisted ? 'active' : ''}" onclick="app.toggleWishlist(${prod.id})">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? '#ff3366' : 'none'}" stroke="${isWishlisted ? '#ff3366' : 'currentColor'}" stroke-width="2.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Value Guarantees -->
            <div class="product-perks-row">
              <div class="perk-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                <span>Express 2-Day Courier</span>
              </div>
              <div class="perk-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <span>2-Year Full Warranty</span>
              </div>
              <div class="perk-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                <span>30-Day Free Returns</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs Section: Overview & Features vs Customer Reviews -->
        <div class="product-tabs-container">
          <div class="tabs-nav-bar">
            <button type="button" class="tab-nav-btn active" id="tab-nav-specs" onclick="app.switchDetailTab('specs')">
              Specifications & Overview
            </button>
            <button type="button" class="tab-nav-btn" id="tab-nav-reviews" onclick="app.switchDetailTab('reviews')">
              Customer Reviews (${prod.reviews.length})
            </button>
          </div>

          <!-- Specs Panel -->
          <div class="tab-panel active" id="tab-panel-specs">
            <div class="specs-content-wrapper">
              <div class="desc-text-box">
                <h3>Product Overview</h3>
                <p>${prod.description}</p>

                <!-- Hardware Specifications Table -->
                <div class="hardware-specs-card">
                  <h4>HARDWARE PROFILE & ATTRIBUTES</h4>
                  <div class="specs-table">
                    <div class="spec-row"><span>PRODUCT NUMBER:</span><strong>#${sku}</strong></div>
                    <div class="spec-row"><span>MODEL SERIES:</span><strong>ALPHA-${prod.category.toUpperCase().slice(0, 3)}-GEN3</strong></div>
                    <div class="spec-row"><span>CATEGORY:</span><strong>${prod.category}</strong></div>
                    <div class="spec-row"><span>WAREHOUSE STOCK:</span><strong class="${isOutOfStock ? 'text-pink' : 'text-emerald'}">${isOutOfStock ? 'Sold Out' : `${prod.stock_count} Units In Stock`}</strong></div>
                    <div class="spec-row"><span>WARRANTY:</span><strong>24 Months Official Coverage</strong></div>
                  </div>
                </div>
              </div>

              ${prod.features && prod.features.length ? `
                <div class="features-checklist-box">
                  <h3>Key Technical Features</h3>
                  <ul class="feature-bullet-list">
                    ${prod.features.map(f => `
                      <li>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>${f}</span>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Reviews Panel -->
          <div class="tab-panel hidden" id="tab-panel-reviews">
            <div class="reviews-section-grid">
              <!-- Reviews List -->
              <div class="reviews-list-col">
                <h3>Verified Customer Feedback</h3>
                ${prod.reviews.length === 0 ? `<p class="no-reviews">No reviews yet. Be the first to share your thoughts!</p>` : `
                  <div class="reviews-stream">
                    ${prod.reviews.map(r => `
                      <div class="review-card">
                        <div class="review-header">
                          <div class="reviewer-meta">
                            <span class="reviewer-avatar">${r.user_name.charAt(0).toUpperCase()}</span>
                            <div>
                              <strong>${r.user_name}</strong>
                              <span class="review-date">${new Date(r.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div class="stars-flex">
                            ${[1, 2, 3, 4, 5].map(s => `
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="${s <= r.rating ? '#f59e0b' : '#334155'}" stroke="${s <= r.rating ? '#f59e0b' : '#475569'}">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                              </svg>
                            `).join('')}
                          </div>
                        </div>
                        <p class="review-body">${r.comment}</p>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- Write a Review Form -->
              <div class="write-review-col">
                <div class="review-form-card">
                  <h3>Write a Review</h3>
                  <form id="submit-review-form" onsubmit="app.handleReviewSubmit(event, ${prod.id})">
                    <div class="form-group">
                      <label>Your Rating</label>
                      <div class="interactive-star-picker" id="star-picker">
                        ${[1, 2, 3, 4, 5].map(s => `
                          <button type="button" class="star-btn ${s <= 5 ? 'active' : ''}" data-val="${s}" onclick="app.setReviewRating(${s})">★</button>
                        `).join('')}
                        <input type="hidden" id="review-rating-val" value="5">
                      </div>
                    </div>

                    <div class="form-group">
                      <label for="review-author-name">Your Name</label>
                      <input type="text" id="review-author-name" class="form-control" required placeholder="e.g. Alex M." value="${window.auth.currentUser ? window.auth.currentUser.name : ''}">
                    </div>

                    <div class="form-group">
                      <label for="review-comment-text">Your Review</label>
                      <textarea id="review-comment-text" class="form-control" rows="4" required placeholder="What did you like or dislike? How does it perform?"></textarea>
                    </div>

                    <button type="submit" class="btn btn-brutalist btn-lime btn-block">POST VERIFIED REVIEW</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="error-msg">Failed to load product details: ${err.message}</div>`;
    }
  },

  setDetailActiveImage(url, btn) {
    const mainImg = document.getElementById('detail-active-img');
    if (mainImg) mainImg.src = url;

    document.querySelectorAll('.thumb-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  },

  adjustDetailQty(delta) {
    const input = document.getElementById('detail-qty-input');
    if (!input) return;
    let val = parseInt(input.value, 10) + delta;
    const min = parseInt(input.min, 10) || 1;
    const max = parseInt(input.max, 10) || 99;
    if (val < min) val = min;
    if (val > max) val = max;
    input.value = val;
  },

  async addCurrentDetailToCart(productId) {
    const input = document.getElementById('detail-qty-input');
    const qty = input ? parseInt(input.value, 10) : 1;
    await window.cart.addItem(productId, qty);
    this.closeModal('product-detail-modal');
    this.openCartDrawer();
  },

  async instantBuyNow(productId) {
    const input = document.getElementById('detail-qty-input');
    const qty = input ? parseInt(input.value, 10) : 1;
    await window.cart.addItem(productId, qty);
    this.closeModal('product-detail-modal');
    this.openCheckoutModal();
  },

  switchDetailTab(tabName) {
    const specsBtn = document.getElementById('tab-nav-specs');
    const reviewsBtn = document.getElementById('tab-nav-reviews');
    const specsPanel = document.getElementById('tab-panel-specs');
    const reviewsPanel = document.getElementById('tab-panel-reviews');

    if (tabName === 'specs') {
      specsBtn?.classList.add('active');
      reviewsBtn?.classList.remove('active');
      specsPanel?.classList.remove('hidden');
      reviewsPanel?.classList.add('hidden');
    } else {
      reviewsBtn?.classList.add('active');
      specsBtn?.classList.remove('active');
      reviewsPanel?.classList.remove('hidden');
      specsPanel?.classList.add('hidden');
    }
  },

  setReviewRating(rating) {
    const hidden = document.getElementById('review-rating-val');
    if (hidden) hidden.value = rating;

    const stars = document.querySelectorAll('#star-picker .star-btn');
    stars.forEach((btn, idx) => {
      if (idx < rating) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  async handleReviewSubmit(e, productId) {
    e.preventDefault();
    const rating = document.getElementById('review-rating-val').value;
    const name = document.getElementById('review-author-name').value.trim();
    const comment = document.getElementById('review-comment-text').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      await window.api.submitReview(productId, { name, rating, comment });
      this.showToast('Thank you! Your review was published.', 'success');
      // Refresh modal
      await this.openProductModal(productId);
      this.switchDetailTab('reviews');
      // Refresh list in background
      this.loadProducts();
    } catch (err) {
      this.showToast(err.message || 'Could not submit review', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Review';
    }
  },

  // ==========================================
  // CHECKOUT & ORDER PROCESSING
  // ==========================================
  openCheckoutModal() {
    if (window.cart.items.length === 0) {
      this.showToast('Your cart is empty!', 'warning');
      return;
    }

    const modal = document.getElementById('checkout-modal');
    if (!modal) return;

    // Reset error box and submit button state
    const errorBox = document.getElementById('checkout-error-msg');
    if (errorBox) errorBox.textContent = '';

    const submitBtn = document.getElementById('place-order-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `CONFIRM & PLACE ORDER • $${window.cart.grandTotal.toFixed(2)}`;
    }

    // Prefill user details if logged in
    const user = window.auth.currentUser;
    if (user) {
      const nameInput = document.getElementById('checkout-name');
      const emailInput = document.getElementById('checkout-email');
      if (nameInput && !nameInput.value) nameInput.value = user.name;
      if (emailInput && !emailInput.value) emailInput.value = user.email;
    }

    this.renderCheckoutSummary();
    this.openModal('checkout-modal');
  },

  renderCheckoutSummary() {
    const listEl = document.getElementById('checkout-items-preview');
    const subtotalEl = document.getElementById('checkout-subtotal');
    const discountEl = document.getElementById('checkout-discount');
    const shippingEl = document.getElementById('checkout-shipping');
    const totalEl = document.getElementById('checkout-total');
    const discountRow = document.getElementById('checkout-discount-row');
    const submitBtn = document.getElementById('place-order-btn');

    if (listEl) {
      listEl.innerHTML = window.cart.items.map(i => {
        const sku = `ALP-${String(i.product_id || i.id).padStart(3, '0')}`;
        return `
          <div class="checkout-item-line">
            <div class="checkout-item-thumb">
              <img src="${i.image}" alt="${i.name}">
              <span class="checkout-item-qty-badge">${i.quantity}</span>
            </div>
            <div class="checkout-item-info">
              <h4 class="checkout-item-title">${i.name}</h4>
              <div class="checkout-item-submeta">
                <span class="checkout-item-sku">#${sku}</span>
                <span class="checkout-item-category">${i.category}</span>
              </div>
            </div>
            <div class="checkout-item-price">$${(i.price * i.quantity).toFixed(2)}</div>
          </div>
        `;
      }).join('');
    }

    if (subtotalEl) subtotalEl.textContent = `$${window.cart.subtotal.toFixed(2)}`;
    if (shippingEl) shippingEl.textContent = window.cart.shippingFee === 0 ? 'FREE' : `$${window.cart.shippingFee.toFixed(2)}`;

    if (discountRow && discountEl) {
      if (window.cart.discountAmount > 0) {
        discountRow.classList.remove('hidden');
        discountEl.textContent = `-$${window.cart.discountAmount.toFixed(2)} (${window.cart.promoCode})`;
      } else {
        discountRow.classList.add('hidden');
      }
    }

    if (totalEl) totalEl.textContent = `$${window.cart.grandTotal.toFixed(2)}`;

    if (submitBtn && !submitBtn.disabled) {
      submitBtn.innerHTML = `CONFIRM & PLACE ORDER • $${window.cart.grandTotal.toFixed(2)}`;
    }
  },

  async handleCheckoutSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('checkout-name').value.trim();
    const email = document.getElementById('checkout-email').value.trim();
    const street = document.getElementById('checkout-street').value.trim();
    const city = document.getElementById('checkout-city').value.trim();
    const state = document.getElementById('checkout-state').value.trim();
    const zip = document.getElementById('checkout-zip').value.trim();
    const country = document.getElementById('checkout-country').value;
    const paymentRadio = document.querySelector('input[name="payment_method"]:checked');
    const submitBtn = document.getElementById('place-order-btn');
    const errorBox = document.getElementById('checkout-error-msg');

    if (!paymentRadio) {
      if (errorBox) errorBox.textContent = 'Please choose a payment method.';
      return;
    }

    const fullAddress = `${street}, ${city}, ${state} ${zip}, ${country}`;
    const paymentMethod = paymentRadio.value;

    if (errorBox) errorBox.textContent = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <div class="spinner-small"></div>
        <span>Processing Secure Order...</span>
      `;
    }

    try {
      const payload = {
        customerName: name,
        customerEmail: email,
        shippingAddress: fullAddress,
        paymentMethod: paymentMethod,
        promoCode: window.cart.promoCode,
        items: window.cart.items
      };

      const res = await window.api.createOrder(payload);
      
      // Order success
      this.closeModal('checkout-modal');
      await window.cart.load(); // Cart will be cleared
      this.showOrderConfirmation(res.order);
      // Reload product stock
      this.loadProducts();
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message || 'Order processing failed. Please check your information.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        const total = window.cart?.grandTotal ? ` • $${window.cart.grandTotal.toFixed(2)}` : '';
        submitBtn.innerHTML = `CONFIRM & PLACE ORDER${total}`;
      }
    }
  },

  showOrderConfirmation(order) {
    const modal = document.getElementById('order-confirmation-modal');
    const content = document.getElementById('order-confirmation-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="confirmation-hero">
        <div class="success-checkmark-circle">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2>Order Confirmed!</h2>
        <p class="order-id-badge">Order ID: <strong>${order.orderNumber}</strong></p>
        <p class="confirmation-subtitle">A confirmation email has been dispatched to <strong>${order.customerEmail}</strong></p>
      </div>

      <div class="confirmation-details-box">
        <div class="conf-info-row">
          <span>Estimated Delivery:</span>
          <strong>2 - 4 Business Days (Express)</strong>
        </div>
        <div class="conf-info-row">
          <span>Shipping To:</span>
          <span>${order.shippingAddress}</span>
        </div>
        <div class="conf-info-row">
          <span>Payment Method:</span>
          <span>${order.paymentMethod}</span>
        </div>
        <div class="conf-info-row total-row">
          <span>Total Paid:</span>
          <strong class="total-highlight">$${order.total.toFixed(2)}</strong>
        </div>
      </div>

      <div class="ordered-items-summary">
        <h4>Ordered Items (${order.items.length})</h4>
        <div class="ordered-items-list">
          ${order.items.map(item => {
            const sku = `ALP-${String(item.product_id || item.id).padStart(3, '0')}`;
            return `
              <div class="ordered-item-card">
                <img src="${item.image}" alt="${item.name}">
                <div class="ordered-item-info">
                  <div class="ordered-item-header">
                    <strong>${item.name}</strong>
                    <span class="ordered-item-sku">#${sku}</span>
                  </div>
                  <span>Qty: ${item.quantity} × $${item.price.toFixed(2)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="confirmation-actions">
        <button type="button" class="btn btn-brutalist btn-white" onclick="app.closeModal('order-confirmation-modal')">CONTINUE SHOPPING</button>
        <button type="button" class="btn btn-brutalist btn-lime" onclick="app.trackOrderDirectly('${order.orderNumber}')">TRACK DISPATCH</button>
      </div>
    `;

    this.openModal('order-confirmation-modal');
  },

  // ==========================================
  // ORDER HISTORY & LIVE TRACKING
  // ==========================================
  async openOrdersModal() {
    const modal = document.getElementById('orders-modal');
    const container = document.getElementById('orders-history-list');
    if (!modal || !container) return;

    this.openModal('orders-modal');
    container.innerHTML = `
      <div class="modal-loading-spinner">
        <div class="spinner"></div>
        <p>Loading your orders...</p>
      </div>
    `;

    try {
      const email = window.auth.currentUser ? window.auth.currentUser.email : '';
      const res = await window.api.getOrders(email);
      const orders = res.orders || [];

      if (orders.length === 0) {
        container.innerHTML = `
          <div class="empty-orders-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            <h3>No Orders Found</h3>
            <p>You have not placed any orders yet. Start exploring our high-performance gear!</p>
            <button type="button" class="btn btn-primary" onclick="app.closeModal('orders-modal')">Explore Products</button>
          </div>
        `;
        return;
      }

      const isAdmin = window.auth.currentUser && window.auth.currentUser.role === 'admin';

      container.innerHTML = orders.map(order => {
        const statuses = ['Processing', 'Shipped', 'Delivered'];
        const currentIdx = statuses.indexOf(order.status);

        return `
          <div class="order-card" data-order="${order.order_number}">
            <div class="order-card-header">
              <div>
                <span class="order-code">${order.order_number}</span>
                <span class="order-date">${new Date(order.created_at).toLocaleDateString()}</span>
              </div>
              <div class="order-header-right">
                <span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span>
                <strong class="order-total-tag">$${order.total.toFixed(2)}</strong>
              </div>
            </div>

            <!-- Tracking progress bar -->
            <div class="order-tracker-bar">
              <div class="tracker-step ${currentIdx >= 0 ? 'completed' : ''}">
                <div class="step-dot">1</div>
                <span>Order Placed</span>
              </div>
              <div class="tracker-line ${currentIdx >= 1 ? 'filled' : ''}"></div>
              <div class="tracker-step ${currentIdx >= 1 ? 'completed' : (currentIdx === 0 ? 'current' : '')}">
                <div class="step-dot">2</div>
                <span>Shipped</span>
              </div>
              <div class="tracker-line ${currentIdx >= 2 ? 'filled' : ''}"></div>
              <div class="tracker-step ${currentIdx >= 2 ? 'completed' : ''}">
                <div class="step-dot">3</div>
                <span>Delivered</span>
              </div>
            </div>

            <!-- Items -->
            <div class="order-items-preview">
              ${(order.items || []).map(i => {
                const sku = `ALP-${String(i.product_id || i.id).padStart(3, '0')}`;
                return `
                  <div class="order-item-chip">
                    <img src="${i.image}" alt="${i.name}">
                    <div class="chip-text">
                      <div class="chip-title-line">
                        <strong>${i.name}</strong>
                        <span class="chip-sku">#${sku}</span>
                      </div>
                      <small>Qty: ${i.quantity} • $${i.price.toFixed(2)}</small>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="order-card-footer">
              <div class="shipping-info-small">
                <strong>Recipient:</strong> ${order.customer_name} (${order.customer_email})<br>
                <strong>Destination:</strong> ${order.shipping_address}
              </div>

              <div class="order-action-controls">
                ${order.status === 'Processing' ? `
                  <button type="button" class="btn btn-cancel-order" onclick="app.cancelOrder(${order.id}, '${order.order_number}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    <span>CANCEL ORDER</span>
                  </button>
                ` : (order.status === 'Cancelled' ? `
                  <span class="cancelled-tag">ORDER CANCELLED</span>
                ` : '')}

                ${isAdmin ? `
                  <div class="admin-order-controls">
                    <label>Status:</label>
                    <select onchange="app.changeOrderStatus(${order.id}, this.value)" class="form-control admin-select">
                      <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                      <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                      <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                      <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="error-msg">Failed to load orders: ${err.message}</div>`;
    }
  },

  async cancelOrder(orderId, orderNumber) {
    if (!confirm(`Are you sure you want to cancel order ${orderNumber}? Product inventory will be restored.`)) {
      return;
    }
    try {
      const res = await window.api.cancelOrder(orderId);
      this.showToast(res.message, 'info');
      await this.openOrdersModal();
      this.loadProducts();
    } catch (err) {
      this.showToast(err.message || 'Failed to cancel order', 'error');
    }
  },

  async changeOrderStatus(orderId, newStatus) {
    try {
      await window.api.updateOrderStatus(orderId, newStatus);
      this.showToast(`Order status updated to ${newStatus}`, 'success');
      this.openOrdersModal();
    } catch (err) {
      this.showToast(err.message || 'Failed to update order', 'error');
    }
  },

  trackOrderDirectly(orderNumber) {
    this.closeModal('order-confirmation-modal');
    this.openOrdersModal();
  },

  // ==========================================
  // MODAL & DRAWER HELPERS
  // ==========================================
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');

    if (modalId === 'product-detail-modal') {
      this.activeProductModalId = null;
      if (window.location.hash.startsWith('#product')) {
        history.replaceState(null, null, ' ');
      }
    }
  },

  openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    drawer?.classList.add('active');
    overlay?.classList.add('active');
    document.body.classList.add('modal-open');
  },

  closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    drawer?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.classList.remove('modal-open');
  },

  openAuthModal(initialTab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');

    if (initialTab === 'login') {
      tabLogin?.click();
    } else {
      tabRegister?.click();
    }
    this.openModal('auth-modal');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-msg">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  handleRouting() {
    const hash = window.location.hash;
    if (hash.startsWith('#product/')) {
      const id = parseInt(hash.replace('#product/', ''), 10);
      if (id) this.openProductModal(id);
    } else if (hash === '#orders') {
      this.openOrdersModal();
    } else if (hash === '#cart') {
      this.openCartDrawer();
    }
  },

  bindGlobalEvents() {
    // Header cart button
    document.querySelectorAll('.cart-trigger-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openCartDrawer());
    });

    // Close cart button & overlay
    document.getElementById('cart-close-btn')?.addEventListener('click', () => this.closeCartDrawer());
    document.getElementById('cart-overlay')?.addEventListener('click', () => this.closeCartDrawer());

    // Orders button
    document.getElementById('orders-nav-btn')?.addEventListener('click', () => this.openOrdersModal());
    document.getElementById('user-menu-orders-link')?.addEventListener('click', () => {
      document.getElementById('user-dropdown')?.classList.remove('active');
      this.openOrdersModal();
    });

    // Search bar input with debounce
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear-btn');
    let debounceTimer;

    searchInput?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const val = e.target.value;
      if (searchClear) searchClear.style.display = val ? 'block' : 'none';

      debounceTimer = setTimeout(() => {
        this.searchQuery = val;
        this.loadProducts();
      }, 250);
    });

    searchClear?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.style.display = 'none';
      this.searchQuery = '';
      this.loadProducts();
    });

    // Keyboard shortcut '/' to search
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput && !document.querySelector('.modal.active')) {
        e.preventDefault();
        searchInput?.focus();
      }
      if (e.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal.active');
        activeModals.forEach(m => this.closeModal(m.id));
        this.closeCartDrawer();
      }
    });

    // Sorting dropdown
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.loadProducts();
    });

    // Price range slider
    const priceSlider = document.getElementById('price-slider');
    const priceDisplay = document.getElementById('price-slider-display');
    priceSlider?.addEventListener('input', (e) => {
      this.priceRange = Number(e.target.value);
      if (priceDisplay) priceDisplay.textContent = `$${this.priceRange}`;
    });
    priceSlider?.addEventListener('change', () => {
      this.loadProducts();
    });

    // In-stock toggle
    document.getElementById('in-stock-checkbox')?.addEventListener('change', (e) => {
      this.inStockOnly = e.target.checked;
      this.loadProducts();
    });

    // Reset filters button
    document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
      this.currentCategory = 'All';
      this.searchQuery = '';
      this.currentSort = 'featured';
      this.priceRange = 1500;
      this.inStockOnly = false;

      if (searchInput) searchInput.value = '';
      if (searchClear) searchClear.style.display = 'none';
      if (priceSlider) priceSlider.value = 1500;
      if (priceDisplay) priceDisplay.textContent = '$1500';
      const sortSelect = document.getElementById('sort-select');
      if (sortSelect) sortSelect.value = 'featured';
      const inStockCb = document.getElementById('in-stock-checkbox');
      if (inStockCb) inStockCb.checked = false;

      this.renderCategoryPills();
      this.loadProducts();
    });

    // Modal Close Buttons
    document.querySelectorAll('.modal-close-btn, .modal-backdrop-dismiss').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal');
        if (modal) this.closeModal(modal.id);
      });
    });

    // Checkout Form Submit
    document.getElementById('checkout-form')?.addEventListener('submit', (e) => {
      this.handleCheckoutSubmit(e);
    });

    // Payment method selector interactive card preview
    document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const cardDetailsBox = document.getElementById('credit-card-fields');
        if (cardDetailsBox) {
          if (e.target.value.includes('Card')) {
            cardDetailsBox.classList.remove('hidden');
          } else {
            cardDetailsBox.classList.add('hidden');
          }
        }
      });
    });

    // Admin panel trigger buttons
    document.getElementById('admin-nav-btn')?.addEventListener('click', () => {
      this.openAdminModal();
    });
    document.getElementById('user-menu-admin-link')?.addEventListener('click', () => {
      document.getElementById('user-dropdown')?.classList.remove('active');
      this.openAdminModal();
    });

    // Listen to authentication changes
    window.auth.onChange((user) => {
      const adminNavBtn = document.getElementById('admin-nav-btn');
      const adminDropdownLink = document.getElementById('user-menu-admin-link');
      if (user && user.role === 'admin') {
        adminNavBtn?.classList.remove('hidden');
        adminDropdownLink?.classList.remove('hidden');
      } else {
        adminNavBtn?.classList.add('hidden');
        adminDropdownLink?.classList.add('hidden');
      }
    });
  },

  // ==========================================
  // ADMIN CONSOLE & CONTROL PLANE
  // ==========================================
  async openAdminModal() {
    if (!window.auth.currentUser || window.auth.currentUser.role !== 'admin') {
      this.showToast('Access Denied: Admin authorization required.', 'error');
      return;
    }

    this.openModal('admin-modal');
    this.switchAdminTab('orders');
    await Promise.all([
      this.loadAdminStats(),
      this.loadAdminInventory()
    ]);
  },

  switchAdminTab(tabName) {
    const panels = {
      'orders': document.getElementById('admin-panel-orders'),
      'inventory': document.getElementById('admin-panel-inventory'),
      'add-product': document.getElementById('admin-panel-add-product')
    };

    const buttons = {
      'orders': document.getElementById('admin-tab-btn-orders'),
      'inventory': document.getElementById('admin-tab-btn-inventory'),
      'add-product': document.getElementById('admin-tab-btn-add-product')
    };

    Object.keys(panels).forEach(key => {
      if (panels[key]) {
        if (key === tabName) {
          panels[key].classList.remove('hidden');
          panels[key].classList.add('active');
        } else {
          panels[key].classList.add('hidden');
          panels[key].classList.remove('active');
        }
      }

      if (buttons[key]) {
        if (key === tabName) {
          buttons[key].classList.add('active');
        } else {
          buttons[key].classList.remove('active');
        }
      }
    });

    if (tabName === 'orders') {
      this.loadAdminOrders('All');
    } else if (tabName === 'inventory') {
      this.loadAdminInventory();
    }
  },

  async loadAdminStats() {
    try {
      const res = await window.api.getStats();
      if (res && res.stats) {
        const revEl = document.getElementById('stat-revenue');
        const ordEl = document.getElementById('stat-orders');
        const prodEl = document.getElementById('stat-products');
        const userEl = document.getElementById('stat-users');

        if (revEl) revEl.textContent = `$${Number(res.stats.revenue).toFixed(2)}`;
        if (ordEl) ordEl.textContent = res.stats.orders;
        if (prodEl) prodEl.textContent = res.stats.products;
        if (userEl) userEl.textContent = res.stats.users;

        const prodBadge = document.getElementById('admin-products-count-badge');
        if (prodBadge) prodBadge.textContent = res.stats.products;
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  },

  currentAdminOrderFilter: 'All',

  async filterAdminOrders(status, btnEl) {
    this.currentAdminOrderFilter = status;
    const buttons = document.querySelectorAll('#admin-order-filters .admin-pill-btn');
    buttons.forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    await this.loadAdminOrders(status);
  },

  async loadAdminOrders(status = this.currentAdminOrderFilter) {
    const container = document.getElementById('admin-orders-stream');
    const countBadge = document.getElementById('admin-orders-count-badge');
    if (!container) return;

    container.innerHTML = `
      <div class="modal-loading-spinner">
        <div class="spinner"></div>
        <p>Loading store orders...</p>
      </div>
    `;

    try {
      const res = await window.api.getOrders('', status);
      const orders = res.orders || [];

      if (countBadge && (!status || status === 'All')) {
        countBadge.textContent = orders.length;
      }

      if (orders.length === 0) {
        container.innerHTML = `
          <div class="empty-orders-state brutalist-box" style="padding: 2.5rem; text-align: center;">
            <h3>No Orders Found</h3>
            <p>No orders match the selected filter (${status}).</p>
          </div>
        `;
        return;
      }

      container.innerHTML = orders.map(order => {
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleString() : 'N/A';
        const items = order.items || [];
        return `
          <div class="admin-order-row" id="admin-order-card-${order.id}">
            <div class="admin-order-top">
              <div>
                <div style="display:flex; align-items:center; gap:0.65rem; margin-bottom:0.25rem;">
                  <strong style="font-family:var(--font-display); font-size:1.05rem; color:#fff;">${order.order_number}</strong>
                  <span class="status-badge status-${(order.status || 'processing').toLowerCase()}">${order.status}</span>
                </div>
                <small style="color:#64748b;">Placed on ${orderDate} • Payment: ${order.payment_method}</small>
              </div>
              <div style="text-align:right;">
                <strong style="font-family:var(--font-display); font-size:1.25rem; color:var(--neon-lime);">$${Number(order.total).toFixed(2)}</strong>
                <small style="display:block; color:#94a3b8;">${items.length} item${items.length === 1 ? '' : 's'}</small>
              </div>
            </div>

            <div class="admin-order-customer">
              <strong>Customer:</strong> ${order.customer_name} &lt;${order.customer_email}&gt;<br>
              <strong>Ship To:</strong> ${order.shipping_address}
            </div>

            <div class="admin-order-items-list">
              ${items.map(item => `
                <div class="admin-mini-item">
                  <img src="${item.image}" alt="${item.name}">
                  <div>
                    <div class="admin-mini-item-name" title="${item.name}">${item.name}</div>
                    <small style="color:#94a3b8;">Qty: ${item.quantity} × $${Number(item.price).toFixed(2)}</small>
                  </div>
                </div>
              `).join('')}
            </div>

            <div class="admin-order-actions-bar">
              <div class="admin-status-control">
                <label>CHANGE STATUS:</label>
                <select class="admin-select-status" onchange="window.app.changeAdminOrderStatus(${order.id}, this.value)">
                  <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                  <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                  <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                  <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>

              ${order.status !== 'Cancelled' ? `
                <button type="button" class="btn btn-brutalist btn-sm btn-white" onclick="window.app.cancelAdminOrder(${order.id}, '${order.order_number}')">
                  CANCEL & RESTOCK
                </button>
              ` : '<span class="cancelled-tag">ORDER CANCELLED</span>'}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="form-error-banner">${err.message || 'Failed to load orders.'}</div>`;
    }
  },

  async changeAdminOrderStatus(orderId, newStatus) {
    try {
      await window.api.updateOrderStatus(orderId, newStatus);
      this.showToast(`Order #${orderId} marked as ${newStatus}`, 'success');
      await Promise.all([
        this.loadAdminOrders(this.currentAdminOrderFilter),
        this.loadAdminStats()
      ]);
    } catch (err) {
      this.showToast(err.message || 'Failed to update order status', 'error');
    }
  },

  async cancelAdminOrder(orderId, orderNumber) {
    if (!confirm(`Cancel order ${orderNumber} and return items to inventory?`)) return;
    try {
      await window.api.cancelOrder(orderId);
      this.showToast(`Order ${orderNumber} cancelled and restocked.`, 'success');
      await Promise.all([
        this.loadAdminOrders(this.currentAdminOrderFilter),
        this.loadAdminStats(),
        this.loadProducts()
      ]);
    } catch (err) {
      this.showToast(err.message || 'Failed to cancel order', 'error');
    }
  },

  allAdminProducts: [],

  async loadAdminInventory() {
    const grid = document.getElementById('admin-inventory-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="modal-loading-spinner">
        <div class="spinner"></div>
        <p>Loading inventory...</p>
      </div>
    `;

    try {
      const res = await window.api.getProducts();
      this.allAdminProducts = res.products || [];

      const countBadge = document.getElementById('admin-products-count-badge');
      if (countBadge) countBadge.textContent = this.allAdminProducts.length;

      this.renderAdminInventoryList(this.allAdminProducts);
    } catch (err) {
      grid.innerHTML = `<div class="form-error-banner">${err.message || 'Failed to load inventory.'}</div>`;
    }
  },

  renderAdminInventoryList(products) {
    const grid = document.getElementById('admin-inventory-grid');
    if (!grid) return;

    if (products.length === 0) {
      grid.innerHTML = `
        <div class="empty-orders-state brutalist-box" style="padding: 2rem; text-align: center;">
          <p>No products match your search.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = products.map(prod => `
      <div class="admin-prod-card" id="admin-prod-card-${prod.id}">
        <div class="admin-prod-left">
          <img src="${prod.image}" alt="${prod.name}" class="admin-prod-thumb">
          <div>
            <h4 class="admin-prod-title">${prod.name}</h4>
            <div class="admin-prod-meta">
              <span>SKU: <strong>${prod.sku || `ALP-${String(prod.id).padStart(3, '0')}`}</strong></span>
              <span>•</span>
              <span>Category: <strong>${prod.category}</strong></span>
              <span>•</span>
              <span>Rating: <strong>★ ${prod.rating.toFixed(1)}</strong></span>
            </div>
          </div>
        </div>

        <div class="admin-prod-controls">
          <div class="admin-field-inline">
            <label>PRICE ($):</label>
            <input type="number" step="0.01" min="1" id="inv-price-${prod.id}" value="${Number(prod.price).toFixed(2)}" class="form-control brutalist-input">
          </div>
          <div class="admin-field-inline">
            <label>STOCK:</label>
            <input type="number" min="0" id="inv-stock-${prod.id}" value="${prod.stock_count}" class="form-control brutalist-input">
          </div>
          <button type="button" class="btn admin-btn-save" onclick="window.app.quickSaveProduct(${prod.id})">
            SAVE
          </button>
          <button type="button" class="btn admin-btn-delete" onclick="window.app.quickDeleteProduct(${prod.id}, '${prod.name.replace(/'/g, "\\'")}')">
            DELETE
          </button>
        </div>
      </div>
    `).join('');
  },

  filterAdminInventory(term) {
    if (!term || !term.trim()) {
      this.renderAdminInventoryList(this.allAdminProducts);
      return;
    }
    const clean = term.toLowerCase().trim();
    const filtered = this.allAdminProducts.filter(p => 
      p.name.toLowerCase().includes(clean) || 
      (p.sku && p.sku.toLowerCase().includes(clean)) ||
      p.category.toLowerCase().includes(clean)
    );
    this.renderAdminInventoryList(filtered);
  },

  async quickSaveProduct(productId) {
    const priceInput = document.getElementById(`inv-price-${productId}`);
    const stockInput = document.getElementById(`inv-stock-${productId}`);
    if (!priceInput || !stockInput) return;

    const price = parseFloat(priceInput.value);
    const stock = parseInt(stockInput.value, 10);

    if (isNaN(price) || price < 0.01) {
      this.showToast('Please enter a valid price.', 'warning');
      return;
    }
    if (isNaN(stock) || stock < 0) {
      this.showToast('Please enter a valid stock count.', 'warning');
      return;
    }

    try {
      await window.api.updateProduct(productId, { price, stock_count: stock });
      this.showToast('Product updated successfully!', 'success');
      // Refresh storefront
      this.loadProducts();
      // Update local cache
      const item = this.allAdminProducts.find(p => p.id === productId);
      if (item) {
        item.price = price;
        item.stock_count = stock;
      }
    } catch (err) {
      this.showToast(err.message || 'Failed to update product', 'error');
    }
  },

  async quickDeleteProduct(productId, productName) {
    if (!confirm(`Are you sure you want to delete "${productName}" from the store catalog?`)) {
      return;
    }

    try {
      await window.api.deleteProduct(productId);
      this.showToast(`Product "${productName}" removed from store.`, 'success');
      await Promise.all([
        this.loadAdminInventory(),
        this.loadAdminStats(),
        this.loadProducts(),
        this.loadCategories()
      ]);
    } catch (err) {
      this.showToast(err.message || 'Failed to delete product', 'error');
    }
  },

  async handleAdminCreateProduct(e) {
    e.preventDefault();

    const name = document.getElementById('admin-new-name').value.trim();
    const category = document.getElementById('admin-new-category').value;
    const price = parseFloat(document.getElementById('admin-new-price').value);
    const origPriceInput = document.getElementById('admin-new-orig-price').value;
    const origPrice = origPriceInput ? parseFloat(origPriceInput) : price;
    const stock = parseInt(document.getElementById('admin-new-stock').value, 10);
    const tagline = document.getElementById('admin-new-tagline').value.trim();
    const image = document.getElementById('admin-new-image').value.trim();
    const desc = document.getElementById('admin-new-desc').value.trim();
    const submitBtn = document.getElementById('admin-submit-product-btn');
    const errorBox = document.getElementById('admin-form-error');

    if (!name || isNaN(price) || !image) {
      if (errorBox) errorBox.textContent = 'Please fill out all required fields with valid values.';
      return;
    }

    if (errorBox) errorBox.textContent = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publishing Product...';
    }

    try {
      const payload = {
        name,
        category,
        price,
        original_price: origPrice,
        stock_count: stock,
        tagline: tagline || name,
        image,
        description: desc || name,
        badge: 'New Arrival',
        is_featured: 1
      };

      await window.api.createProduct(payload);
      this.showToast(`Product "${name}" successfully listed in store!`, 'success');

      // Reset form
      document.getElementById('admin-add-product-form')?.reset();

      // Refresh catalog and stats
      await Promise.all([
        this.loadProducts(),
        this.loadCategories(),
        this.loadAdminStats(),
        this.loadAdminInventory()
      ]);

      // Switch back to inventory view
      this.switchAdminTab('inventory');
    } catch (err) {
      if (errorBox) errorBox.textContent = err.message || 'Could not publish product.';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'CONFIRM & PUBLISH PRODUCT TO STORE';
      }
    }
  },

  copyToClipboard(text, message = 'Copied to clipboard!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(message, 'success');
      }).catch(() => {
        this.showToast(`Product Code: ${text}`, 'info');
      });
    } else {
      this.showToast(`Product Code: ${text}`, 'info');
    }
  }
};

window.app = app;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
