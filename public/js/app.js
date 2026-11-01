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

  async loadWishlist() {
    try {
      const saved = localStorage.getItem('ca_wishlist');
      if (saved) {
        this.wishlist = new Set(JSON.parse(saved));
      }
    } catch (e) {
      this.wishlist = new Set();
    }

    // Synchronize with backend SQLite database if user is logged in
    if (window.auth && window.auth.user) {
      try {
        const res = await window.api.getWishlist();
        if (res && res.wishlist) {
          res.wishlist.forEach(p => this.wishlist.add(p.id));
          localStorage.setItem('ca_wishlist', JSON.stringify(Array.from(this.wishlist)));
        }
      } catch (err) {
        // Silently use cached local wishlist
      }
    }
    this.updateWishlistBadge();
  },

  async toggleWishlist(productId) {
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

    // If product detail modal is open and shows this product, update heart button
    const detailHeart = document.querySelector('.wishlist-toggle-btn');
    if (detailHeart && this.activeProductModalId === id) {
      const isWish = this.wishlist.has(id);
      detailHeart.classList.toggle('active', isWish);
      detailHeart.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWish ? '#ff3366' : 'none'}" stroke="${isWish ? '#ff3366' : 'currentColor'}" stroke-width="2.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      `;
    }

    // Sync with SQLite backend if user is authenticated
    if (window.auth && window.auth.user) {
      try {
        await window.api.toggleWishlist(id);
      } catch (err) {
        // Silently continue
      }
    }
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? '#ff3366' : 'none'}" stroke="${isWishlisted ? '#ff3366' : 'currentColor'}" stroke-width="2.2">
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
      const related = this.products.filter(p => p.category === prod.category && p.id !== prod.id).slice(0, 3);

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

        ${related.length > 0 ? `
          <div class="related-products-section" style="margin-top: 2rem; border-top: 2px solid #000; padding-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="font-size: 1rem; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; margin: 0;">
                ⚡ RELATED HARDWARE // SAME CATEGORY (${prod.category.toUpperCase()})
              </h3>
              <span class="brutalist-tag tag-neon" style="font-size: 0.7rem;">SIMILAR ARCHITECTURE</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
              ${related.map(rel => `
                <div class="brutalist-box" style="padding: 0.75rem; display: flex; flex-direction: column; justify-content: space-between; background: #fff;">
                  <div>
                    <img src="${rel.image}" alt="${rel.name}" style="width: 100%; height: 110px; object-fit: cover; border: 2px solid #000; margin-bottom: 0.5rem; cursor: pointer;" onclick="app.openProductModal(${rel.id})">
                    <h4 style="font-size: 0.85rem; font-weight: 800; margin: 0 0 0.25rem 0; cursor: pointer;" onclick="app.openProductModal(${rel.id})">${rel.name}</h4>
                    <span style="font-size: 0.95rem; font-weight: 900; color: #000;">$${rel.price.toFixed(2)}</span>
                  </div>
                  <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                    <button type="button" class="btn btn-brutalist btn-white btn-xs" style="flex: 1;" onclick="app.openProductModal(${rel.id})">VIEW</button>
                    <button type="button" class="btn btn-brutalist btn-lime btn-xs" style="flex: 1;" onclick="window.cart.addItem(${rel.id}, 1)">+ CART</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
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
      errorBox.textContent = 'Please choose a payment method.';
      return;
    }

    const fullAddress = `${street}, ${city}, ${state} ${zip}, ${country}`;
    const paymentMethod = paymentRadio.value;

    errorBox.textContent = '';
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="spinner-small"></div>
      <span>Processing Secure Order...</span>
    `;

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
      errorBox.textContent = err.message || 'Order processing failed. Please check your information.';
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Place Order • $${window.cart.grandTotal.toFixed(2)}`;
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
  // INDIVIDUAL ORDER DETAILS & INVOICE
  // ==========================================
  async showOrderDetail(orderNumber) {
    const modal = document.getElementById('order-detail-modal');
    const content = document.getElementById('order-detail-content');
    if (!modal || !content) return;

    this.openModal('order-detail-modal');
    content.innerHTML = `
      <div class="modal-loading-spinner">
        <div class="spinner"></div>
        <p>Retrieving order telemetry & invoice records...</p>
      </div>
    `;

    try {
      const res = await window.api.getOrderByNumber(orderNumber);
      const order = res.order;
      if (!order) throw new Error('Order details not found');

      const isCancelled = order.status === 'Cancelled';
      const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered'];
      let currentIdx = statuses.indexOf(order.status);
      if (currentIdx === -1 && !isCancelled) currentIdx = 1;

      content.innerHTML = `
        <div class="invoice-container brutalist-box">
          <div class="invoice-header">
            <div>
              <span class="invoice-badge">OFFICIAL INVOICE</span>
              <h2>ORDER #${order.order_number}</h2>
              <small class="invoice-date">Placed: ${new Date(order.created_at).toLocaleString()}</small>
            </div>
            <div class="invoice-header-right">
              <span class="status-badge status-${order.status.toLowerCase()}">${order.status.toUpperCase()}</span>
              <strong class="invoice-total">$${Number(order.total).toFixed(2)}</strong>
            </div>
          </div>

          ${isCancelled ? `
            <div class="order-cancelled-banner" style="background: #ffe4e6; border: 2px solid #e11d48; padding: 1rem; margin: 1.5rem 0; color: #9f1239; font-weight: 800; text-align: center;">
              ⚠️ ORDER CANCELLED // Inventory units have been restored to warehouse stock.
            </div>
          ` : `
            <!-- Tracking progress bar -->
            <div class="order-tracker-bar" style="margin: 1.5rem 0;">
              <div class="tracker-step ${currentIdx >= 0 ? 'completed' : ''}">
                <div class="step-dot">1</div>
                <span>Pending</span>
              </div>
              <div class="tracker-line ${currentIdx >= 1 ? 'filled' : ''}"></div>
              <div class="tracker-step ${currentIdx >= 1 ? 'completed' : (currentIdx === 0 ? 'current' : '')}">
                <div class="step-dot">2</div>
                <span>Processing</span>
              </div>
              <div class="tracker-line ${currentIdx >= 2 ? 'filled' : ''}"></div>
              <div class="tracker-step ${currentIdx >= 2 ? 'completed' : (currentIdx === 1 ? 'current' : '')}">
                <div class="step-dot">3</div>
                <span>Air Shipped</span>
              </div>
              <div class="tracker-line ${currentIdx >= 3 ? 'filled' : ''}"></div>
              <div class="tracker-step ${currentIdx >= 3 ? 'completed' : ''}">
                <div class="step-dot">4</div>
                <span>Delivered</span>
              </div>
            </div>
          `}

          <div class="invoice-grid-2">
            <div class="invoice-block">
              <h4>RECIPIENT & DESTINATION</h4>
              <p>
                <strong>${order.customer_name}</strong><br>
                ${order.customer_email}<br>
                ${order.shipping_address}
              </p>
            </div>
            <div class="invoice-block">
              <h4>PAYMENT TELEMETRY</h4>
              <p>
                <strong>Method:</strong> ${order.payment_method}<br>
                <strong>Status:</strong> ${order.payment_status || 'Paid'}<br>
                <strong>Currency:</strong> USD ($)
              </p>
            </div>
          </div>

          <div class="invoice-items-table-wrap">
            <table class="brutalist-table">
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th>SKU</th>
                  <th>QTY</th>
                  <th>UNIT PRICE</th>
                  <th>SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${(order.items || []).map(i => {
                  const sku = `ALP-${String(i.product_id || i.id).padStart(3, '0')}`;
                  return `
                    <tr>
                      <td>
                        <div class="table-prod-cell">
                          <img src="${i.image}" alt="${i.name}" class="table-prod-thumb">
                          <strong>${i.name}</strong>
                        </div>
                      </td>
                      <td><code>#${sku}</code></td>
                      <td><strong>${i.quantity}</strong></td>
                      <td>$${Number(i.price).toFixed(2)}</td>
                      <td>$${(Number(i.price) * Number(i.quantity)).toFixed(2)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="invoice-summary-math">
            <div class="math-row">
              <span>Subtotal:</span>
              <span>$${Number(order.subtotal).toFixed(2)}</span>
            </div>
            ${order.discount > 0 ? `
              <div class="math-row text-emerald">
                <span>Promo Discount:</span>
                <span>-$${Number(order.discount).toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="math-row">
              <span>Shipping Fee:</span>
              <span>${order.shipping_fee === 0 ? 'FREE' : `$${Number(order.shipping_fee).toFixed(2)}`}</span>
            </div>
            <div class="math-row invoice-grand-total">
              <span>TOTAL PAID:</span>
              <strong>$${Number(order.total).toFixed(2)}</strong>
            </div>
          </div>

          <div class="invoice-actions" style="margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-brutalist btn-white" onclick="window.print()">
              🖨️ PRINT INVOICE
            </button>
            <button type="button" class="btn btn-brutalist btn-white" onclick="app.downloadInvoice('${order.order_number}')">
              📥 DOWNLOAD INVOICE
            </button>
            <button type="button" class="btn btn-brutalist btn-lime" onclick="app.closeModal('order-detail-modal')">
              CLOSE
            </button>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="error-msg">Failed to load order telemetry: ${err.message}</div>`;
    }
  },

  downloadInvoice(orderNumber) {
    const printContents = document.querySelector('.invoice-container')?.outerHTML;
    if (!printContents) return;
    const blob = new Blob([`
      <!DOCTYPE html>
      <html>
      <head>
        <title>INVOICE_${orderNumber}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; padding: 2rem; color: #000; background: #fff; }
          .brutalist-box, .invoice-container { border: 2px solid #000; padding: 1.5rem; max-width: 800px; margin: 0 auto; box-shadow: 4px 4px 0 #000; }
          .invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 1rem; margin-bottom: 1rem; }
          .invoice-badge { display: inline-block; background: #000; color: #fff; padding: 0.25rem 0.5rem; font-weight: bold; font-size: 0.8rem; margin-bottom: 0.5rem; }
          .invoice-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
          .brutalist-table { width: 100%; border-collapse: collapse; margin: 1rem 0; border: 2px solid #000; }
          .brutalist-table th, .brutalist-table td { border: 1px solid #000; padding: 0.5rem; text-align: left; }
          .brutalist-table th { background: #f1f5f9; }
          .invoice-summary-math { margin-top: 1rem; border-top: 2px solid #000; padding-top: 0.75rem; width: 300px; margin-left: auto; }
          .math-row { display: flex; justify-content: space-between; margin-bottom: 0.35rem; }
          .invoice-grand-total { font-size: 1.2rem; font-weight: 900; border-top: 2px solid #000; padding-top: 0.5rem; }
          .invoice-actions, .order-tracker-bar { display: none; }
          .table-prod-thumb { display: none; }
        </style>
      </head>
      <body>
        ${printContents}
      </body>
      </html>
    `], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `INVOICE_${orderNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Invoice for ${orderNumber} downloaded!`, 'success');
  },

  // ==========================================
  // SAVED WISHLIST MODAL
  // ==========================================
  openWishlistModal() {
    this.renderWishlistModal();
    this.openModal('wishlist-modal');
  },

  renderWishlistModal() {
    const container = document.getElementById('wishlist-items-stream');
    if (!container) return;

    if (this.wishlist.size === 0) {
      container.innerHTML = `
        <div class="empty-orders-state">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⭐</div>
          <h3>YOUR WISHLIST IS EMPTY</h3>
          <p>Earmark items from the catalog by clicking the star badge on any product card.</p>
          <button type="button" class="btn btn-brutalist btn-lime" onclick="app.closeModal('wishlist-modal'); document.getElementById('products-section').scrollIntoView({behavior:'smooth'});">
            BROWSE HARDWARE
          </button>
        </div>
      `;
      return;
    }

    const savedIds = Array.from(this.wishlist);
    const savedProducts = this.products.filter(p => savedIds.includes(p.id));

    container.innerHTML = `
      <div class="wishlist-grid">
        ${savedProducts.map(p => `
          <div class="wishlist-card brutalist-box">
            <div class="wishlist-thumb">
              <img src="${p.image}" alt="${p.name}">
              <button type="button" class="wishlist-remove-btn" onclick="app.toggleWishlist(${p.id}); app.renderWishlistModal();" title="Remove from wishlist">&times;</button>
            </div>
            <div class="wishlist-details">
              <span class="wishlist-cat">${p.category}</span>
              <h4>${p.name}</h4>
              <div class="wishlist-price-line">
                <strong class="wishlist-price">$${p.price.toFixed(2)}</strong>
                ${p.stock_count > 0 ? '<span class="stock-pill in-stock">IN STOCK</span>' : '<span class="stock-pill out-of-stock">BACKORDER</span>'}
              </div>
              <button type="button" class="btn btn-brutalist btn-lime btn-sm btn-block" style="margin-top: 0.75rem;" onclick="app.moveWishlistToCart(${p.id})">
                🛒 MOVE TO CART
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  async moveWishlistToCart(productId) {
    await window.cart.addItem(productId, 1);
    this.wishlist.delete(productId);
    localStorage.setItem('ca_wishlist', JSON.stringify(Array.from(this.wishlist)));
    this.updateWishlistBadge();
    this.renderWishlistModal();
    this.renderProducts();
    this.closeModal('wishlist-modal');
    this.openCartDrawer();
  },

  // ==========================================
  // USER PROFILE MODAL
  // ==========================================
  openProfileModal() {
    if (!window.auth.currentUser) {
      this.openAuthModal('login');
      return;
    }
    window.auth.updateUI();
    this.openModal('profile-modal');
  },

  // ==========================================
  // POLICY MODAL TABS
  // ==========================================
  openPolicyTab(tabName) {
    this.openModal('policy-modal');
    const tabs = ['terms', 'privacy', 'returns'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-policy-${t}`);
      const content = document.getElementById(`policy-content-${t}`);
      if (t === tabName) {
        btn?.classList.add('active');
        content?.classList.remove('hidden');
      } else {
        btn?.classList.remove('active');
        content?.classList.add('hidden');
      }
    });
  },

  // ==========================================
  // ADMIN COMMAND CENTER & CRUD
  // ==========================================
  async openAdminModal() {
    if (!window.auth.currentUser || window.auth.currentUser.role !== 'admin') {
      this.showToast('Access restricted: Administrator login required.', 'error');
      this.openAuthModal('login');
      return;
    }
    this.openModal('admin-modal');
    await this.loadAdminOverview();
  },

  async loadAdminOverview() {
    try {
      const res = await window.api.getAdminDashboard();
      if (!res.success) throw new Error(res.message);

      document.getElementById('adm-kpi-revenue').textContent = `$${res.metrics.revenue.toFixed(2)}`;
      document.getElementById('adm-kpi-orders').textContent = res.metrics.orders;
      document.getElementById('adm-kpi-products').textContent = res.metrics.products;
      document.getElementById('adm-kpi-customers').textContent = res.metrics.customers;

      const lowStockWrap = document.getElementById('adm-low-stock-list');
      if (lowStockWrap) {
        if (!res.lowStock || res.lowStock.length === 0) {
          lowStockWrap.innerHTML = '<p class="text-muted">All inventory levels are optimal.</p>';
        } else {
          lowStockWrap.innerHTML = `
            <table class="brutalist-table">
              <thead>
                <tr>
                  <th>PRODUCT</th>
                  <th>CATEGORY</th>
                  <th>PRICE</th>
                  <th>REMAINING STOCK</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                ${res.lowStock.map(p => `
                  <tr>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.category}</td>
                    <td>$${Number(p.price).toFixed(2)}</td>
                    <td><span class="stock-badge-low">${p.stock_count} units left</span></td>
                    <td>
                      <button type="button" class="btn btn-brutalist btn-white btn-xs" onclick="app.openProductEditor(${p.id})">RESTOCK</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
      }
    } catch (err) {
      this.showToast(`Admin Telemetry Error: ${err.message}`, 'error');
    }
  },

  async loadAdminProducts() {
    const container = document.getElementById('adm-products-table-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner-small"></div> Loading products...';
    try {
      const res = await window.api.getProducts({ inStock: false });
      const products = res.products || [];

      container.innerHTML = `
        <table class="brutalist-table">
          <thead>
            <tr>
              <th>IMAGE</th>
              <th>SKU</th>
              <th>NAME</th>
              <th>CATEGORY</th>
              <th>PRICE</th>
              <th>STOCK</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td><img src="${p.image}" alt="${p.name}" class="table-prod-thumb"></td>
                <td><code>${p.sku || '#ALP-' + String(p.id).padStart(3, '0')}</code></td>
                <td><strong>${p.name}</strong></td>
                <td>${p.category}</td>
                <td>$${p.price.toFixed(2)}</td>
                <td><strong class="${p.stock_count <= 10 ? 'text-danger' : ''}">${p.stock_count}</strong></td>
                <td>
                  <div class="table-btn-group">
                    <button type="button" class="btn btn-brutalist btn-white btn-xs" onclick="app.openProductEditor(${p.id})">EDIT</button>
                    <button type="button" class="btn btn-brutalist btn-danger btn-xs" onclick="app.deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')">DELETE</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  },

  async loadAdminOrders() {
    const container = document.getElementById('adm-orders-table-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner-small"></div> Loading customer orders...';
    try {
      const res = await window.api.getOrders();
      const orders = res.orders || [];

      container.innerHTML = `
        <table class="brutalist-table">
          <thead>
            <tr>
              <th>ORDER #</th>
              <th>DATE</th>
              <th>CUSTOMER</th>
              <th>TOTAL</th>
              <th>PAYMENT</th>
              <th>STATUS</th>
              <th>DISPATCH CONTROLS</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td><strong>${o.order_number}</strong></td>
                <td>${new Date(o.created_at).toLocaleDateString()}</td>
                <td>${o.customer_name}<br><small>${o.customer_email}</small></td>
                <td><strong>$${Number(o.total).toFixed(2)}</strong></td>
                <td><span class="brutalist-tag tag-neon">${o.payment_method} (${o.payment_status || 'Paid'})</span></td>
                <td><span class="status-badge status-${o.status.toLowerCase()}">${o.status}</span></td>
                <td>
                  <div class="table-order-actions">
                    <select onchange="app.changeOrderStatus(${o.id}, this.value)" class="form-control admin-select-sm">
                      <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
                      <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                      <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                      <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                    <button type="button" class="btn btn-brutalist btn-white btn-xs" onclick="app.showOrderDetail('${o.order_number}')">VIEW</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  },

  async loadAdminCoupons() {
    const container = document.getElementById('adm-coupons-table-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner-small"></div> Loading promo coupons...';
    try {
      const res = await window.api.getAdminCoupons();
      const coupons = res.coupons || [];

      container.innerHTML = `
        <table class="brutalist-table">
          <thead>
            <tr>
              <th>CODE</th>
              <th>DISCOUNT %</th>
              <th>MIN SPEND</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            ${coupons.map(c => `
              <tr>
                <td><strong class="text-lime">[ ${c.code} ]</strong></td>
                <td><strong>${c.discount_percent}% OFF</strong></td>
                <td>$${Number(c.min_purchase || 0).toFixed(2)}</td>
                <td><span class="brutalist-tag tag-neon">${c.is_active ? 'ACTIVE' : 'EXPIRED'}</span></td>
                <td>
                  <button type="button" class="btn btn-brutalist btn-danger btn-xs" onclick="app.deleteCoupon(${c.id}, '${c.code}')">DELETE</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  },

  async loadAdminCustomers() {
    const container = document.getElementById('adm-customers-table-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner-small"></div> Loading customer list...';
    try {
      const res = await window.api.getAdminCustomers();
      const customers = res.customers || [];

      container.innerHTML = `
        <table class="brutalist-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>NAME</th>
              <th>EMAIL</th>
              <th>PHONE</th>
              <th>ROLE</th>
              <th>TOTAL ORDERS</th>
              <th>TOTAL SPENT</th>
            </tr>
          </thead>
          <tbody>
            ${customers.map(c => `
              <tr>
                <td>#${c.id}</td>
                <td><strong>${c.name}</strong></td>
                <td>${c.email}</td>
                <td>${c.phone || '—'}</td>
                <td><span class="brutalist-tag ${c.role === 'admin' ? 'tag-warning' : 'tag-neon'}">${c.role.toUpperCase()}</span></td>
                <td><strong>${c.total_orders || 0}</strong></td>
                <td>$${Number(c.total_spent || 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  },

  openProductEditor(productId = null) {
    const modal = document.getElementById('product-editor-modal');
    const form = document.getElementById('product-editor-form');
    const title = document.getElementById('product-editor-title');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('edit-prod-id').value = '';

    if (productId) {
      const prod = this.products.find(p => p.id === Number(productId));
      if (prod) {
        title.textContent = `EDIT HARDWARE SPEC // ${prod.name}`;
        document.getElementById('edit-prod-id').value = prod.id;
        document.getElementById('edit-prod-name').value = prod.name;
        document.getElementById('edit-prod-category').value = prod.category;
        document.getElementById('edit-prod-badge').value = prod.badge || '';
        document.getElementById('edit-prod-price').value = prod.price;
        document.getElementById('edit-prod-original-price').value = prod.original_price || '';
        document.getElementById('edit-prod-stock').value = prod.stock_count;
        document.getElementById('edit-prod-tagline').value = prod.tagline || '';
        document.getElementById('edit-prod-image').value = prod.image;
        document.getElementById('edit-prod-desc').value = prod.description;
      }
    } else {
      title.textContent = 'DEPLOY NEW HARDWARE SPEC';
    }

    this.openModal('product-editor-modal');
  },

  async handleProductEditorSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-prod-id').value;
    const name = document.getElementById('edit-prod-name').value.trim();
    const category = document.getElementById('edit-prod-category').value;
    const badge = document.getElementById('edit-prod-badge').value.trim();
    const price = Number(document.getElementById('edit-prod-price').value);
    const original_price = document.getElementById('edit-prod-original-price').value ? Number(document.getElementById('edit-prod-original-price').value) : null;
    const stock_count = parseInt(document.getElementById('edit-prod-stock').value, 10);
    const tagline = document.getElementById('edit-prod-tagline').value.trim();
    const image = document.getElementById('edit-prod-image').value.trim();
    const description = document.getElementById('edit-prod-desc').value.trim();

    const payload = {
      name,
      category,
      badge,
      price,
      original_price,
      stock_count,
      tagline,
      image,
      description
    };

    const submitBtn = document.getElementById('edit-prod-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      if (id) {
        await window.api.updateProduct(id, payload);
        this.showToast('Product updated successfully!', 'success');
      } else {
        await window.api.createProduct(payload);
        this.showToast('Product deployed to catalog!', 'success');
      }
      this.closeModal('product-editor-modal');
      await this.loadProducts();
      await this.loadAdminProducts();
      await this.loadAdminOverview();
    } catch (err) {
      this.showToast(err.message || 'Error saving product', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SAVE HARDWARE SPEC';
    }
  },

  async deleteProduct(productId, name) {
    if (!confirm(`Are you sure you want to permanently remove "${name}" from the store catalog?`)) {
      return;
    }
    try {
      await window.api.deleteProduct(productId);
      this.showToast(`Product "${name}" deleted.`, 'info');
      await this.loadProducts();
      await this.loadAdminProducts();
      await this.loadAdminOverview();
    } catch (err) {
      this.showToast(err.message || 'Failed to delete product', 'error');
    }
  },

  async handleCouponSubmit(e) {
    e.preventDefault();
    const code = document.getElementById('adm-new-coupon-code').value.trim();
    const discount_percent = Number(document.getElementById('adm-new-coupon-pct').value);
    const min_purchase = Number(document.getElementById('adm-new-coupon-min').value) || 0;

    try {
      const res = await window.api.createCoupon({ code, discount_percent, min_purchase });
      this.showToast(res.message, 'success');
      document.getElementById('adm-coupon-form').reset();
      await this.loadAdminCoupons();
    } catch (err) {
      this.showToast(err.message || 'Failed to create coupon', 'error');
    }
  },

  async deleteCoupon(couponId, code) {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try {
      await window.api.deleteCoupon(couponId);
      this.showToast(`Coupon "${code}" deleted`, 'info');
      await this.loadAdminCoupons();
    } catch (err) {
      this.showToast(err.message || 'Failed to delete coupon', 'error');
    }
  },

  async loadAdminCategories() {
    const container = document.getElementById('adm-categories-table-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner-small"></div> Loading categories...';
    try {
      const res = await window.api.getCategories();
      const categories = res.categories || [];

      container.innerHTML = `
        <table class="brutalist-table">
          <thead>
            <tr>
              <th>CATEGORY NAME</th>
              <th>DESCRIPTION</th>
              <th>LIVE PRODUCTS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${categories.map(c => `
              <tr>
                <td><strong>${c.category}</strong></td>
                <td>${c.description || '—'}</td>
                <td><span class="brutalist-tag tag-neon">${c.count} items</span></td>
                <td>
                  <div style="display: flex; gap: 0.35rem;">
                    <button type="button" class="btn btn-brutalist btn-white btn-xs" onclick="app.renameCategory('${encodeURIComponent(c.category)}')">RENAME</button>
                    <button type="button" class="btn btn-brutalist btn-danger btn-xs" onclick="app.deleteCategory('${encodeURIComponent(c.category)}', ${c.count})">DELETE</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  },

  async handleCategorySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('adm-cat-name');
    const descInput = document.getElementById('adm-cat-desc');
    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    try {
      const res = await window.api.adminCreateCategory({ name, description });
      this.showToast(res.message, 'success');
      document.getElementById('adm-create-category-form').reset();
      await this.loadCategories();
      await this.loadAdminCategories();
    } catch (err) {
      this.showToast(err.message || 'Failed to create category', 'error');
    }
  },

  async renameCategory(encodedName) {
    const oldName = decodeURIComponent(encodedName);
    const newName = prompt(`Enter new name for category "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    try {
      const res = await window.api.adminUpdateCategory(oldName, { name: newName.trim() });
      this.showToast(res.message, 'success');
      await this.loadCategories();
      await this.loadProducts();
      await this.loadAdminCategories();
      await this.loadAdminProducts();
    } catch (err) {
      this.showToast(err.message || 'Failed to rename category', 'error');
    }
  },

  async deleteCategory(encodedName, count) {
    const catName = decodeURIComponent(encodedName);
    if (count > 0) {
      this.showToast(`Cannot delete "${catName}": ${count} products are currently assigned to it.`, 'error');
      return;
    }
    if (!confirm(`Are you sure you want to delete category "${catName}"?`)) return;

    try {
      const res = await window.api.adminDeleteCategory(catName);
      this.showToast(res.message, 'info');
      await this.loadCategories();
      await this.loadAdminCategories();
    } catch (err) {
      this.showToast(err.message || 'Failed to delete category', 'error');
    }
  },

  async handleContactSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const subject = document.getElementById('contact-subject').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    const submitBtn = document.getElementById('contact-submit-btn');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Dispatching message...';

    try {
      const res = await window.api.submitContact({ name, email, subject, message });
      this.showToast(res.message, 'success');
      document.getElementById('contact-form').reset();
      this.closeModal('contact-modal');
    } catch (err) {
      this.showToast(err.message || 'Failed to submit inquiry', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'DISPATCH INQUIRY MESSAGE';
    }
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
    window.auth?.openFullscreenAuth(initialTab);
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
    if (hash === '#login') {
      window.auth?.openFullscreenAuth('login');
      return;
    } else if (hash === '#register') {
      window.auth?.openFullscreenAuth('register');
      return;
    }

    // Close full-screen auth if navigating away
    if (!hash.startsWith('#login') && !hash.startsWith('#register')) {
      window.auth?.closeFullscreenAuth(false);
    }

    if (hash.startsWith('#product/')) {
      const id = parseInt(hash.replace('#product/', ''), 10);
      if (id) this.openProductModal(id);
    } else if (hash === '#orders') {
      this.openOrdersModal();
    } else if (hash === '#cart') {
      this.openCartDrawer();
    } else if (hash === '#wishlist') {
      this.openWishlistModal();
    } else if (hash === '#profile') {
      this.openProfileModal();
    } else if (hash === '#admin') {
      this.openAdminModal();
    } else if (hash === '#about') {
      this.openModal('about-modal');
    } else if (hash === '#contact') {
      this.openModal('contact-modal');
    } else if (hash === '#faq') {
      this.openModal('faq-modal');
    } else if (hash === '#privacy' || hash === '#terms' || hash === '#returns') {
      this.openPolicyTab(hash.replace('#', ''));
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

    // Wishlist button
    document.getElementById('wishlist-nav-btn')?.addEventListener('click', () => this.openWishlistModal());

    // Orders button
    document.getElementById('orders-nav-btn')?.addEventListener('click', () => this.openOrdersModal());
    document.getElementById('user-menu-orders-link')?.addEventListener('click', () => {
      document.getElementById('user-dropdown')?.classList.remove('active');
      this.openOrdersModal();
    });

    // Contact Form Submit
    document.getElementById('contact-form')?.addEventListener('submit', (e) => {
      this.handleContactSubmit(e);
    });

    // Admin product editor form submit
    document.getElementById('product-editor-form')?.addEventListener('submit', (e) => {
      this.handleProductEditorSubmit(e);
    });

    // Admin coupon form submit
    document.getElementById('adm-coupon-form')?.addEventListener('submit', (e) => {
      this.handleCouponSubmit(e);
    });

    // Admin category form submit
    document.getElementById('adm-create-category-form')?.addEventListener('submit', (e) => {
      this.handleCategorySubmit(e);
    });

    // Admin Add Product CTA
    document.getElementById('adm-add-product-btn')?.addEventListener('click', () => {
      this.openProductEditor();
    });

    // Admin Tabs Switching
    const adminTabs = [
      { id: 'adm-tab-overview', panel: 'adm-panel-overview', load: () => this.loadAdminOverview() },
      { id: 'adm-tab-products', panel: 'adm-panel-products', load: () => this.loadAdminProducts() },
      { id: 'adm-tab-categories', panel: 'adm-panel-categories', load: () => this.loadAdminCategories() },
      { id: 'adm-tab-orders', panel: 'adm-panel-orders', load: () => this.loadAdminOrders() },
      { id: 'adm-tab-coupons', panel: 'adm-panel-coupons', load: () => this.loadAdminCoupons() },
      { id: 'adm-tab-customers', panel: 'adm-panel-customers', load: () => this.loadAdminCustomers() }
    ];

    adminTabs.forEach(tab => {
      document.getElementById(tab.id)?.addEventListener('click', () => {
        adminTabs.forEach(t => {
          document.getElementById(t.id)?.classList.remove('active');
          document.getElementById(t.panel)?.classList.add('hidden');
        });
        document.getElementById(tab.id)?.classList.add('active');
        document.getElementById(tab.panel)?.classList.remove('hidden');
        tab.load();
      });
    });

    // Policy Tabs Switching
    const policyTabs = ['terms', 'privacy', 'returns'];
    policyTabs.forEach(tabName => {
      document.getElementById(`tab-policy-${tabName}`)?.addEventListener('click', () => {
        this.openPolicyTab(tabName);
      });
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
