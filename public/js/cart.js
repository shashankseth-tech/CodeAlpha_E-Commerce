/**
 * CodeAlpha E-Commerce Store - Cart Manager
 */

const cart = {
  items: [],
  subtotal: 0,
  promoCode: '',
  discountAmount: 0,
  shippingFee: 0,
  grandTotal: 0,

  async init() {
    this.promoCode = localStorage.getItem('ca_promo_code') || '';
    await this.load();
    this.bindEvents();
  },

  async load() {
    try {
      const data = await window.api.getCart();
      this.items = data.items || [];
      this.subtotal = data.subtotal || 0;
      this.calculateTotals();
      this.render();
    } catch (e) {
      console.error('Failed to load cart:', e);
    }
  },

  calculateTotals() {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    this.subtotal = Math.round(this.subtotal * 100) / 100;

    // Apply promo discount
    this.discountAmount = 0;
    if (this.promoCode) {
      const code = this.promoCode.trim().toUpperCase();
      if (code === 'ALPHA10') {
        this.discountAmount = Math.round(this.subtotal * 0.10 * 100) / 100;
      } else if (code === 'ALPHA15' || code === 'CODEALPHA') {
        this.discountAmount = Math.round(this.subtotal * 0.15 * 100) / 100;
      } else if (code === 'WELCOME20') {
        this.discountAmount = Math.round(this.subtotal * 0.20 * 100) / 100;
      }
    }

    // Shipping fee: Free if subtotal >= 99, otherwise $12 flat (if cart has items)
    if (this.items.length === 0) {
      this.shippingFee = 0;
    } else {
      this.shippingFee = this.subtotal >= 99 ? 0 : 12.00;
    }

    this.grandTotal = Math.max(0, Math.round((this.subtotal - this.discountAmount + this.shippingFee) * 100) / 100);
  },

  async addItem(productId, quantity = 1) {
    try {
      await window.api.addToCart(productId, quantity);
      await this.load();
      window.app?.showToast('Added to cart!', 'success');
      this.pulseCartBadge();
    } catch (err) {
      window.app?.showToast(err.message || 'Could not add to cart', 'error');
    }
  },

  async updateQuantity(productId, quantity) {
    try {
      await window.api.updateCartItem(productId, quantity);
      await this.load();
    } catch (err) {
      window.app?.showToast(err.message || 'Could not update item', 'error');
    }
  },

  async removeItem(productId) {
    try {
      await window.api.removeCartItem(productId);
      await this.load();
      window.app?.showToast('Item removed from cart', 'info');
    } catch (err) {
      window.app?.showToast(err.message || 'Could not remove item', 'error');
    }
  },

  async clear() {
    try {
      await window.api.clearCart();
      await this.load();
    } catch (err) {
      console.error(err);
    }
  },

  applyPromo(code) {
    const cleanCode = code.trim().toUpperCase();
    const validCodes = {
      'ALPHA15': 15,
      'ALPHA10': 10,
      'CODEALPHA': 15,
      'WELCOME20': 20
    };

    if (!validCodes[cleanCode]) {
      throw new Error('Invalid promo code. Try ALPHA15 for 15% off!');
    }

    this.promoCode = cleanCode;
    localStorage.setItem('ca_promo_code', cleanCode);
    this.calculateTotals();
    this.render();
    window.app?.showToast(`Coupon applied! Saved ${validCodes[cleanCode]}%`, 'success');
  },

  removePromo() {
    this.promoCode = '';
    localStorage.removeItem('ca_promo_code');
    this.calculateTotals();
    this.render();
    window.app?.showToast('Promo code removed', 'info');
  },

  pulseCartBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach(b => {
      b.classList.remove('pulse');
      void b.offsetWidth; // trigger reflow
      b.classList.add('pulse');
    });
  },

  render() {
    const totalCount = this.items.reduce((sum, item) => sum + item.quantity, 0);

    // Update cart badge counts
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach(b => {
      b.textContent = totalCount;
      b.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    });

    // Update drawer header count
    const drawerTitleCount = document.getElementById('cart-drawer-count');
    if (drawerTitleCount) {
      drawerTitleCount.textContent = `(${totalCount} item${totalCount === 1 ? '' : 's'})`;
    }

    // Render items container
    const container = document.getElementById('cart-items-list');
    const emptyState = document.getElementById('cart-empty-state');
    const footer = document.getElementById('cart-drawer-footer');

    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (footer) footer.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (footer) footer.classList.remove('hidden');

    container.innerHTML = this.items.map(item => `
      <div class="cart-item-card" data-product-id="${item.product_id}">
        <div class="cart-item-thumb-box">
          <img src="${item.image}" alt="${item.name}" class="cart-item-img" loading="lazy">
        </div>
        <div class="cart-item-details">
          <div class="cart-item-top-row">
            <div class="cart-item-meta-badges">
              <span class="cart-item-sku">#ALP-${String(item.product_id).padStart(3, '0')}</span>
              <span class="cart-item-cat-pill">${item.category}</span>
            </div>
            <button type="button" class="cart-trash-btn" onclick="cart.removeItem(${item.product_id})" title="Remove item" aria-label="Remove item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
          <h4 class="cart-item-name" title="${item.name}">${item.name}</h4>
          <div class="cart-item-bottom-row">
            <div class="cart-item-stepper">
              <button type="button" class="stepper-btn dec" onclick="cart.updateQuantity(${item.product_id}, ${item.quantity - 1})">−</button>
              <span class="stepper-count">${item.quantity}</span>
              <button type="button" class="stepper-btn inc" onclick="cart.updateQuantity(${item.product_id}, ${item.quantity + 1})" ${item.quantity >= item.stock_count ? 'disabled' : ''}>+</button>
            </div>
            <div class="cart-item-price-block">
              <span class="cart-item-unit-price">${item.quantity > 1 ? `$${item.price.toFixed(2)} ea` : ''}</span>
              <strong class="cart-item-total-price">$${(item.price * item.quantity).toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Summary numbers
    const subtotalEl = document.getElementById('cart-subtotal-val');
    const shippingEl = document.getElementById('cart-shipping-val');
    const discountRow = document.getElementById('cart-discount-row');
    const discountVal = document.getElementById('cart-discount-val');
    const totalEl = document.getElementById('cart-total-val');
    const promoActiveTag = document.getElementById('promo-active-tag');
    const promoCodeName = document.getElementById('promo-code-name');

    if (subtotalEl) subtotalEl.textContent = `$${this.subtotal.toFixed(2)}`;
    if (shippingEl) {
      if (this.shippingFee === 0) {
        shippingEl.innerHTML = '<span class="free-shipping-tag">FREE</span>';
      } else {
        shippingEl.textContent = `$${this.shippingFee.toFixed(2)}`;
      }
    }

    if (discountRow && discountVal) {
      if (this.discountAmount > 0) {
        discountRow.classList.remove('hidden');
        discountVal.textContent = `-$${this.discountAmount.toFixed(2)}`;
      } else {
        discountRow.classList.add('hidden');
      }
    }

    if (promoActiveTag && promoCodeName) {
      if (this.promoCode) {
        promoActiveTag.classList.remove('hidden');
        promoCodeName.textContent = this.promoCode;
      } else {
        promoActiveTag.classList.add('hidden');
      }
    }

    if (totalEl) totalEl.textContent = `$${this.grandTotal.toFixed(2)}`;

    // Free shipping threshold indicator
    const shippingProgress = document.getElementById('free-shipping-progress');
    const shippingMsg = document.getElementById('free-shipping-msg');
    if (shippingProgress && shippingMsg) {
      const remaining = Math.max(0, 99 - this.subtotal);
      if (remaining === 0) {
        shippingProgress.style.width = '100%';
        shippingMsg.innerHTML = '🎉 You unlocked <strong>FREE Standard Shipping</strong>!';
      } else {
        const pct = Math.min(100, Math.round((this.subtotal / 99) * 100));
        shippingProgress.style.width = `${pct}%`;
        shippingMsg.innerHTML = `Add <strong>$${remaining.toFixed(2)}</strong> more to get <strong>FREE Shipping</strong>!`;
      }
    }
  },

  bindEvents() {
    const promoForm = document.getElementById('cart-promo-form');
    const promoInput = document.getElementById('cart-promo-input');
    const removePromoBtn = document.getElementById('remove-promo-btn');
    const checkoutBtn = document.getElementById('cart-checkout-btn');

    promoForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = promoInput.value.trim();
      if (!code) return;
      try {
        this.applyPromo(code);
        promoInput.value = '';
      } catch (err) {
        window.app?.showToast(err.message, 'error');
      }
    });

    removePromoBtn?.addEventListener('click', () => {
      this.removePromo();
    });

    checkoutBtn?.addEventListener('click', () => {
      if (this.items.length === 0) return;
      window.app?.closeCartDrawer();
      window.app?.openCheckoutModal();
    });
  }
};

window.cart = cart;
