const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'codealpha-super-secret-ecommerce-key-2026';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper for JWT authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }
  next();
}

// Attach auth token middleware globally
app.use(authenticateToken);

// ==========================================
// 1. PRODUCTS API
// ==========================================

// GET /api/categories
app.get('/api/categories', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM products 
      GROUP BY category 
      ORDER BY count DESC
    `).all();
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products
app.get('/api/products', (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, inStock, sort, featured } = req.query;

    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search && search.trim() !== '') {
      query += ' AND (name LIKE ? OR description LIKE ? OR tagline LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (minPrice) {
      query += ' AND price >= ?';
      params.push(Number(minPrice));
    }

    if (maxPrice) {
      query += ' AND price <= ?';
      params.push(Number(maxPrice));
    }

    if (inStock === 'true' || inStock === '1') {
      query += ' AND stock_count > 0';
    }

    if (featured === 'true' || featured === '1') {
      query += ' AND is_featured = 1';
    }

    // Sorting
    switch (sort) {
      case 'price_asc':
        query += ' ORDER BY price ASC';
        break;
      case 'price_desc':
        query += ' ORDER BY price DESC';
        break;
      case 'rating':
        query += ' ORDER BY rating DESC, reviews_count DESC';
        break;
      case 'newest':
        query += ' ORDER BY id DESC';
        break;
      case 'featured':
      default:
        query += ' ORDER BY is_featured DESC, rating DESC';
        break;
    }

    const rows = db.prepare(query).all(...params);

    const formatted = rows.map(prod => ({
      ...prod,
      sku: `ALP-${String(prod.id).padStart(3, '0')}`,
      item_number: `#ALP-${String(prod.id).padStart(3, '0')}`,
      gallery: prod.gallery_json ? JSON.parse(prod.gallery_json) : [prod.image],
      features: prod.features_json ? JSON.parse(prod.features_json) : []
    }));

    res.json({ success: true, count: formatted.length, products: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  try {
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!prod) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Get reviews
    const reviews = db.prepare(`
      SELECT * FROM reviews 
      WHERE product_id = ? 
      ORDER BY created_at DESC
    `).all(req.params.id);

    res.json({
      success: true,
      product: {
        ...prod,
        sku: `ALP-${String(prod.id).padStart(3, '0')}`,
        item_number: `#ALP-${String(prod.id).padStart(3, '0')}`,
        gallery: prod.gallery_json ? JSON.parse(prod.gallery_json) : [prod.image],
        features: prod.features_json ? JSON.parse(prod.features_json) : [],
        reviews
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/products/:id/reviews
app.post('/api/products/:id/reviews', (req, res) => {
  try {
    const { name, rating, comment } = req.body;
    const productId = req.params.id;

    if (!name || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'Name, rating, and comment are required.' });
    }

    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!prod) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    db.prepare(`
      INSERT INTO reviews (product_id, user_name, rating, comment)
      VALUES (?, ?, ?, ?)
    `).run(productId, name.trim(), Number(rating), comment.trim());

    // Recalculate average rating
    const stats = db.prepare(`
      SELECT AVG(rating) as avgRating, COUNT(*) as totalReviews 
      FROM reviews 
      WHERE product_id = ?
    `).get(productId);

    const newRating = Math.round(Number(stats.avgRating) * 10) / 10;
    const newCount = Number(stats.totalReviews);

    db.prepare(`
      UPDATE products 
      SET rating = ?, reviews_count = ? 
      WHERE id = ?
    `).run(newRating, newCount, productId);

    res.json({
      success: true,
      message: 'Review submitted successfully',
      rating: newRating,
      reviews_count: newCount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 2. USER AUTHENTICATION API
// ==========================================

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=0f172a,2563eb,38bdf8`;

    const info = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, avatar)
      VALUES (?, ?, ?, 'customer', ?)
    `).run(name.trim(), normalizedEmail, passwordHash, defaultAvatar);

    const userId = Number(info.lastInsertRowid);
    const userPayload = { id: userId, email: normalizedEmail, name: name.trim(), role: 'customer', avatar: defaultAvatar };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userPayload
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userPayload
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 3. SHOPPING CART API
// ==========================================

// Helper to resolve user or session id
function getCartIdentifier(req) {
  if (req.user && req.user.id) {
    return { userId: req.user.id, sessionId: null };
  }
  const sessionId = req.headers['x-session-id'] || 'guest_session_default';
  return { userId: null, sessionId };
}

// GET /api/cart
app.get('/api/cart', (req, res) => {
  try {
    const { userId, sessionId } = getCartIdentifier(req);

    let rows;
    if (userId) {
      rows = db.prepare(`
        SELECT c.id, c.quantity, p.id as product_id, p.name, p.price, p.original_price, p.image, p.stock_count, p.category
        FROM cart_items c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
      `).all(userId);
    } else {
      rows = db.prepare(`
        SELECT c.id, c.quantity, p.id as product_id, p.name, p.price, p.original_price, p.image, p.stock_count, p.category
        FROM cart_items c
        JOIN products p ON c.product_id = p.id
        WHERE c.session_id = ?
        ORDER BY c.created_at DESC
      `).all(sessionId);
    }

    const items = rows.map(r => ({
      cart_item_id: r.id,
      product_id: r.product_id,
      sku: `ALP-${String(r.product_id).padStart(3, '0')}`,
      item_number: `#ALP-${String(r.product_id).padStart(3, '0')}`,
      name: r.name,
      price: r.price,
      original_price: r.original_price,
      image: r.image,
      category: r.category,
      stock_count: r.stock_count,
      quantity: r.quantity,
      subtotal: Math.round(r.price * r.quantity * 100) / 100
    }));

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

    res.json({
      success: true,
      items,
      totalQuantity,
      subtotal: Math.round(subtotal * 100) / 100
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/cart (add item or increment)
app.post('/api/cart', (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID required' });
    }

    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!prod) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const qty = Math.max(1, Number(quantity));
    const { userId, sessionId } = getCartIdentifier(req);

    let existing;
    if (userId) {
      existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(userId, productId);
    } else {
      existing = db.prepare('SELECT * FROM cart_items WHERE session_id = ? AND product_id = ?').get(sessionId, productId);
    }

    if (existing) {
      const newQty = Math.min(prod.stock_count, existing.quantity + qty);
      db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
    } else {
      const initialQty = Math.min(prod.stock_count, qty);
      if (userId) {
        db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)').run(userId, productId, initialQty);
      } else {
        db.prepare('INSERT INTO cart_items (session_id, product_id, quantity) VALUES (?, ?, ?)').run(sessionId, productId, initialQty);
      }
    }

    res.json({ success: true, message: `Added "${prod.name}" to cart.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/cart/:productId (update exact quantity)
app.put('/api/cart/:productId', (req, res) => {
  try {
    const { quantity } = req.body;
    const productId = req.params.productId;
    const qty = Number(quantity);

    const { userId, sessionId } = getCartIdentifier(req);

    if (qty <= 0) {
      // Remove
      if (userId) {
        db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(userId, productId);
      } else {
        db.prepare('DELETE FROM cart_items WHERE session_id = ? AND product_id = ?').run(sessionId, productId);
      }
      return res.json({ success: true, message: 'Item removed from cart' });
    }

    const prod = db.prepare('SELECT stock_count FROM products WHERE id = ?').get(productId);
    const validQty = Math.min(prod ? prod.stock_count : qty, qty);

    if (userId) {
      db.prepare('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?').run(validQty, userId, productId);
    } else {
      db.prepare('UPDATE cart_items SET quantity = ? WHERE session_id = ? AND product_id = ?').run(validQty, sessionId, productId);
    }

    res.json({ success: true, message: 'Cart updated', quantity: validQty });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/cart/:productId
app.delete('/api/cart/:productId', (req, res) => {
  try {
    const productId = req.params.productId;
    const { userId, sessionId } = getCartIdentifier(req);

    if (userId) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(userId, productId);
    } else {
      db.prepare('DELETE FROM cart_items WHERE session_id = ? AND product_id = ?').run(sessionId, productId);
    }

    res.json({ success: true, message: 'Item removed from cart' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/cart (clear cart)
app.delete('/api/cart', (req, res) => {
  try {
    const { userId, sessionId } = getCartIdentifier(req);

    if (userId) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    } else {
      db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
    }

    res.json({ success: true, message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 4. ORDER PROCESSING & CHECKOUT API
// ==========================================

// POST /api/orders (Process and place order)
app.post('/api/orders', (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      shippingAddress,
      paymentMethod,
      items,
      promoCode
    } = req.body;

    if (!customerName || !customerEmail || !shippingAddress || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, email, shipping address, and payment method are required.'
      });
    }

    const { userId, sessionId } = getCartIdentifier(req);

    // Resolve order items: either from payload or from database cart
    let orderItems = items;
    if (!orderItems || !orderItems.length) {
      let rows;
      if (userId) {
        rows = db.prepare(`
          SELECT c.quantity, p.id, p.name, p.price, p.image, p.stock_count
          FROM cart_items c JOIN products p ON c.product_id = p.id
          WHERE c.user_id = ?
        `).all(userId);
      } else {
        rows = db.prepare(`
          SELECT c.quantity, p.id, p.name, p.price, p.image, p.stock_count
          FROM cart_items c JOIN products p ON c.product_id = p.id
          WHERE c.session_id = ?
        `).all(sessionId);
      }
      orderItems = rows;
    }

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Your cart is empty. Please add items to checkout.' });
    }

    // Verify stock and calculate subtotal
    let subtotal = 0;
    const finalItems = [];

    for (const item of orderItems) {
      const prod = db.prepare('SELECT id, name, price, image, stock_count FROM products WHERE id = ?').get(item.id || item.product_id);
      if (!prod) {
        return res.status(400).json({ success: false, message: `Product with ID ${item.id} not found.` });
      }

      const qty = Math.max(1, Number(item.quantity));
      subtotal += prod.price * qty;

      finalItems.push({
        id: prod.id,
        sku: `ALP-${String(prod.id).padStart(3, '0')}`,
        item_number: `#ALP-${String(prod.id).padStart(3, '0')}`,
        name: prod.name,
        price: prod.price,
        image: prod.image,
        quantity: qty
      });

      // Update inventory
      const newStock = Math.max(0, prod.stock_count - qty);
      db.prepare('UPDATE products SET stock_count = ? WHERE id = ?').run(newStock, prod.id);
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // Calculate promo discount
    let discount = 0;
    if (promoCode) {
      const code = promoCode.trim().toUpperCase();
      if (code === 'ALPHA10') {
        discount = Math.round(subtotal * 0.10 * 100) / 100;
      } else if (code === 'ALPHA15' || code === 'CODEALPHA') {
        discount = Math.round(subtotal * 0.15 * 100) / 100;
      } else if (code === 'WELCOME20') {
        discount = Math.round(subtotal * 0.20 * 100) / 100;
      }
    }

    // Free shipping if subtotal >= 99, otherwise $12 flat
    const shippingFee = subtotal >= 99 ? 0 : 12.00;
    const total = Math.round((subtotal - discount + shippingFee) * 100) / 100;

    // Generate unique order number
    let orderNumber;
    for (let attempts = 0; attempts < 15; attempts++) {
      const candidate = `ALP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(candidate);
      if (!existing) {
        orderNumber = candidate;
        break;
      }
    }
    if (!orderNumber) {
      orderNumber = `ALP-2026-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
    }

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_number, user_id, customer_name, customer_email,
        shipping_address, payment_method, subtotal, discount,
        shipping_fee, total, status, items_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?)
    `);

    const info = insertOrder.run(
      orderNumber,
      userId || null,
      customerName.trim(),
      customerEmail.trim(),
      shippingAddress.trim(),
      paymentMethod.trim(),
      subtotal,
      discount,
      shippingFee,
      total,
      JSON.stringify(finalItems)
    );

    // Clear cart
    if (userId) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    } else {
      db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
    }

    res.status(201).json({
      success: true,
      message: 'Order processed successfully!',
      order: {
        id: Number(info.lastInsertRowid),
        orderNumber,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        shippingAddress: shippingAddress.trim(),
        paymentMethod: paymentMethod.trim(),
        subtotal,
        discount,
        shippingFee,
        total,
        status: 'Processing',
        items: finalItems,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/orders (User order history or admin view)
app.get('/api/orders', (req, res) => {
  try {
    const { userId } = getCartIdentifier(req);
    const email = req.query.email;
    const statusFilter = req.query.status;

    let orders;
    if (req.user && req.user.role === 'admin') {
      if (statusFilter && statusFilter !== 'All') {
        orders = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(statusFilter);
      } else {
        orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
      }
    } else if (userId) {
      orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    } else if (email) {
      orders = db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC').all(email.trim().toLowerCase());
    } else {
      orders = [];
    }

    const formatted = orders.map(o => ({
      ...o,
      items: o.items_json ? JSON.parse(o.items_json) : []
    }));

    res.json({ success: true, count: formatted.length, orders: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/orders/:orderNumber (Look up single order by number)
app.get('/api/orders/:orderNumber', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      order: {
        ...order,
        items: order.items_json ? JSON.parse(order.items_json) : []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/orders/:id/cancel (Customer or admin cancel order)
app.post('/api/orders/:id/cancel', (req, res) => {
  try {
    const orderId = req.params.id;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'This order has already been cancelled.' });
    }

    if (order.status === 'Delivered') {
      return res.status(400).json({ success: false, message: 'Delivered orders cannot be cancelled. Please contact support for returns.' });
    }

    // Update status to Cancelled
    db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(orderId);

    // Restore inventory
    if (order.items_json) {
      try {
        const items = JSON.parse(order.items_json);
        for (const item of items) {
          const prodId = item.id || item.product_id;
          const qty = Number(item.quantity) || 1;
          if (prodId) {
            db.prepare('UPDATE products SET stock_count = stock_count + ? WHERE id = ?').run(qty, prodId);
          }
        }
      } catch (e) {
        console.error('Error parsing items for restock:', e);
      }
    }

    res.json({
      success: true,
      message: `Order ${order.order_number} has been cancelled successfully.`,
      orderNumber: order.order_number,
      status: 'Cancelled'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/orders/:id/status
app.patch('/api/admin/orders/:id/status', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
    }

    const { status } = req.body;
    const allowed = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `Order status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/products (Add new product)
app.post('/api/admin/products', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
    }

    const {
      name,
      tagline,
      category,
      price,
      original_price,
      stock_count,
      image,
      gallery,
      description,
      features,
      badge,
      is_featured
    } = req.body;

    if (!name || !price || !category || !image) {
      return res.status(400).json({ success: false, message: 'Name, price, category, and image URL are required.' });
    }

    const galleryJson = gallery ? (typeof gallery === 'string' ? gallery : JSON.stringify(gallery)) : JSON.stringify([image]);
    const featuresJson = features ? (typeof features === 'string' ? features : JSON.stringify(features)) : JSON.stringify([
      'Precision engineered components',
      'Brutalist durability certification',
      'Next-generation connectivity'
    ]);

    const stmt = db.prepare(`
      INSERT INTO products (
        name, tagline, category, price, original_price, stock_count,
        rating, reviews_count, badge, image, gallery_json, description,
        features_json, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      name.trim(),
      (tagline || '').trim(),
      category.trim(),
      Number(price),
      original_price ? Number(original_price) : Number(price),
      stock_count !== undefined ? Number(stock_count) : 20,
      badge || 'New Arrival',
      image.trim(),
      galleryJson,
      (description || name).trim(),
      featuresJson,
      is_featured ? 1 : 0
    );

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId: Number(info.lastInsertRowid)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/products/:id (Quick update stock or price)
app.patch('/api/admin/products/:id', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
    }

    const prodId = req.params.id;
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!prod) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const { stock_count, price, name, is_featured } = req.body;
    const updates = [];
    const params = [];

    if (stock_count !== undefined) {
      updates.push('stock_count = ?');
      params.push(Math.max(0, Number(stock_count)));
    }
    if (price !== undefined) {
      updates.push('price = ?');
      params.push(Math.max(0, Number(price)));
    }
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (is_featured !== undefined) {
      updates.push('is_featured = ?');
      params.push(is_featured ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided for update.' });
    }

    params.push(prodId);
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Product updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/products/:id (Delete product)
app.delete('/api/admin/products/:id', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
    }

    const prodId = req.params.id;
    db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(prodId);
    db.prepare('DELETE FROM reviews WHERE product_id = ?').run(prodId);
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(prodId);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/stats (Quick store stats)
app.get('/api/stats', (req, res) => {
  try {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const totalRevenue = db.prepare('SELECT SUM(total) as sum FROM orders').get().sum || 0;
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    res.json({
      success: true,
      stats: {
        products: totalProducts,
        orders: totalOrders,
        revenue: Math.round(totalRevenue * 100) / 100,
        users: totalUsers
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fallback to index.html for single-page routing (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`ALPHA STORE [Neo-Brutalist Edition] is running!`);
  console.log(`Store URL: http://localhost:${PORT}`);
  console.log(`Backend API: http://localhost:${PORT}/api/products`);
  console.log(`===============================================`);
});
