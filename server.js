try { if (process.loadEnvFile) process.loadEnvFile(); } catch (e) { }
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

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Administrator privileges required.' });
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
      SELECT c.name as category, COUNT(p.id) as count, COALESCE(c.description, '') as description
      FROM categories c
      LEFT JOIN products p ON p.category = c.name
      GROUP BY c.id, c.name
      UNION
      SELECT category, COUNT(*) as count, '' as description
      FROM products
      WHERE category NOT IN (SELECT name FROM categories)
      GROUP BY category
      ORDER BY count DESC
    `).all();
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/categories (Admin create category)
app.post('/api/admin/categories', requireAuth, requireAdmin, (req, res) => {
  try {
    const { name, description = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }
    const cleanName = name.trim();
    const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existing) {
      return res.status(400).json({ success: false, message: `Category "${cleanName}" already exists.` });
    }
    db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(cleanName, description.trim());
    res.status(201).json({ success: true, message: `Category "${cleanName}" created successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/categories/:name (Admin update category name / description)
app.put('/api/admin/categories/:name', requireAuth, requireAdmin, (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name).trim();
    const { name: newName, description } = req.body;
    if (!newName || !newName.trim()) {
      return res.status(400).json({ success: false, message: 'New category name is required.' });
    }
    const cleanNewName = newName.trim();

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('UPDATE categories SET name = ?, description = COALESCE(?, description) WHERE LOWER(name) = LOWER(?)')
        .run(cleanNewName, description !== undefined ? description.trim() : null, oldName);
      db.prepare('UPDATE products SET category = ? WHERE LOWER(category) = LOWER(?)')
        .run(cleanNewName, oldName);
      db.exec('COMMIT;');
      res.json({ success: true, message: `Category updated from "${oldName}" to "${cleanNewName}".` });
    } catch (inner) {
      db.exec('ROLLBACK;');
      throw inner;
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/categories/:name (Admin delete category)
app.delete('/api/admin/categories/:name', requireAuth, requireAdmin, (req, res) => {
  try {
    const catName = decodeURIComponent(req.params.name).trim();
    const prodCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE LOWER(category) = LOWER(?)').get(catName).count;
    if (prodCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category "${catName}" because ${prodCount} product(s) belong to it. Reassign or delete them first.`
      });
    }
    db.prepare('DELETE FROM categories WHERE LOWER(name) = LOWER(?)').run(catName);
    res.json({ success: true, message: `Category "${catName}" deleted successfully.` });
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

// POST /api/products (Admin Create Product)
app.post('/api/products', requireAuth, requireAdmin, (req, res) => {
  try {
    const {
      name,
      tagline,
      category,
      price,
      original_price,
      badge,
      image,
      gallery,
      description,
      features,
      stock_count = 20,
      is_featured = 0
    } = req.body;

    if (!name || !category || !price || !image || !description) {
      return res.status(400).json({ success: false, message: 'Name, category, price, image, and description are required.' });
    }

    const galleryArr = Array.isArray(gallery) && gallery.length ? gallery : [image];
    const featuresArr = Array.isArray(features) ? features : [];

    const stmt = db.prepare(`
      INSERT INTO products (
        name, tagline, category, price, original_price, rating, reviews_count,
        badge, image, gallery_json, description, features_json, stock_count, is_featured
      ) VALUES (?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      name.trim(),
      (tagline || '').trim(),
      category.trim(),
      Number(price),
      original_price ? Number(original_price) : null,
      (badge || '').trim(),
      image.trim(),
      JSON.stringify(galleryArr),
      description.trim(),
      JSON.stringify(featuresArr),
      Math.max(0, parseInt(stock_count, 10) || 0),
      is_featured ? 1 : 0
    );

    const newId = Number(info.lastInsertRowid);
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId: newId
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/products/:id (Admin Update Product)
app.put('/api/products/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const productId = req.params.id;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const {
      name = existing.name,
      tagline = existing.tagline,
      category = existing.category,
      price = existing.price,
      original_price = existing.original_price,
      badge = existing.badge,
      image = existing.image,
      gallery,
      description = existing.description,
      features,
      stock_count = existing.stock_count,
      is_featured = existing.is_featured
    } = req.body;

    const galleryJson = gallery ? JSON.stringify(gallery) : existing.gallery_json;
    const featuresJson = features ? JSON.stringify(features) : existing.features_json;

    db.prepare(`
      UPDATE products SET
        name = ?, tagline = ?, category = ?, price = ?, original_price = ?,
        badge = ?, image = ?, gallery_json = ?, description = ?, features_json = ?,
        stock_count = ?, is_featured = ?
      WHERE id = ?
    `).run(
      name.trim(),
      (tagline || '').trim(),
      category.trim(),
      Number(price),
      original_price ? Number(original_price) : null,
      (badge || '').trim(),
      image.trim(),
      galleryJson,
      description.trim(),
      featuresJson,
      Math.max(0, parseInt(stock_count, 10)),
      is_featured ? 1 : 0,
      productId
    );

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/products/:id (Admin Delete Product)
app.delete('/api/products/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const productId = req.params.id;
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    res.json({ success: true, message: 'Product deleted successfully' });
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
    const user = db.prepare('SELECT id, name, email, role, avatar, phone, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/profile (Update Name & Phone)
app.put('/api/auth/profile', requireAuth, (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
    }

    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name.trim(), (phone || '').trim(), req.user.id);
    const updated = db.prepare('SELECT id, name, email, role, avatar, phone, created_at FROM users WHERE id = ?').get(req.user.id);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/password (Change Password)
app.put('/api/auth/password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ success: true, message: 'Password updated successfully' });
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
// 4. WISHLIST API
// ==========================================

// GET /api/wishlist (User saved items)
app.get('/api/wishlist', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*, w.created_at as wishlisted_at
      FROM wishlist w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
    `).all(req.user.id);

    const formatted = rows.map(prod => ({
      ...prod,
      sku: `ALP-${String(prod.id).padStart(3, '0')}`,
      item_number: `#ALP-${String(prod.id).padStart(3, '0')}`,
      gallery: prod.gallery_json ? JSON.parse(prod.gallery_json) : [prod.image],
      features: prod.features_json ? JSON.parse(prod.features_json) : []
    }));

    res.json({ success: true, count: formatted.length, wishlist: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/wishlist/:productId (Toggle save/unsave)
app.post('/api/wishlist/:productId', requireAuth, (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const prod = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId);
    if (!prod) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?').get(req.user.id, productId);
    if (existing) {
      db.prepare('DELETE FROM wishlist WHERE id = ?').run(existing.id);
      return res.json({ success: true, action: 'removed', inWishlist: false, message: `Removed "${prod.name}" from wishlist.` });
    } else {
      db.prepare('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)').run(req.user.id, productId);
      return res.status(201).json({ success: true, action: 'added', inWishlist: true, message: `Added "${prod.name}" to wishlist.` });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/wishlist/:productId (Explicit delete)
app.delete('/api/wishlist/:productId', requireAuth, (req, res) => {
  try {
    const productId = Number(req.params.productId);
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.id, productId);
    res.json({ success: true, message: 'Product removed from wishlist.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 5. ORDER PROCESSING & CHECKOUT API
// ==========================================

// POST /api/orders (Process and place order atomically)
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

    // Pre-check stock for all items
    for (const item of orderItems) {
      const prod = db.prepare('SELECT id, name, price, image, stock_count FROM products WHERE id = ?').get(item.id || item.product_id);
      if (!prod) {
        return res.status(400).json({ success: false, message: `Product with ID ${item.id || item.product_id} not found.` });
      }

      const qty = Math.max(1, Number(item.quantity));
      if (prod.stock_count < qty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${prod.name}". Only ${prod.stock_count} unit${prod.stock_count === 1 ? '' : 's'} available.`
        });
      }

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
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // Calculate promo discount from database
    let discount = 0;
    if (promoCode) {
      const code = promoCode.trim().toUpperCase();
      const coup = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code);
      if (coup && subtotal >= (coup.min_purchase || 0)) {
        discount = Math.round(subtotal * (coup.discount_percent / 100) * 100) / 100;
      } else if (code === 'ALPHA15' || code === 'CODEALPHA') {
        discount = Math.round(subtotal * 0.15 * 100) / 100;
      } else if (code === 'ALPHA10' && subtotal >= 50) {
        discount = Math.round(subtotal * 0.10 * 100) / 100;
      } else if (code === 'WELCOME20' && subtotal >= 100) {
        discount = Math.round(subtotal * 0.20 * 100) / 100;
      }
    }

    // Free shipping if subtotal >= 99, otherwise $12 flat
    const shippingFee = subtotal >= 99 ? 0 : 12.00;
    const total = Math.max(0, Math.round((subtotal - discount + shippingFee) * 100) / 100);

    // Payment status: Pending for COD, Paid for instant methods
    const paymentStatus = paymentMethod.includes('Cash on Delivery') ? 'Pending' : 'Paid';

    // Generate unique order number
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ALP-2026-${randomSuffix}`;

    // Execute atomic transaction for inventory deduction and order insertion
    db.exec('BEGIN TRANSACTION;');
    let orderId;
    try {
      // Deduct stock
      for (const item of finalItems) {
        db.prepare('UPDATE products SET stock_count = stock_count - ? WHERE id = ?').run(item.quantity, item.id);
      }

      const insertOrder = db.prepare(`
        INSERT INTO orders (
          order_number, user_id, customer_name, customer_email,
          shipping_address, payment_method, payment_status, subtotal, discount,
          shipping_fee, total, status, items_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?)
      `);

      const info = insertOrder.run(
        orderNumber,
        userId || null,
        customerName.trim(),
        customerEmail.trim(),
        shippingAddress.trim(),
        paymentMethod.trim(),
        paymentStatus,
        subtotal,
        discount,
        shippingFee,
        total,
        JSON.stringify(finalItems)
      );

      orderId = Number(info.lastInsertRowid);

      // Insert relational order items
      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, product_sku, product_image, unit_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of finalItems) {
        insertOrderItem.run(
          orderId,
          item.id,
          item.name,
          item.sku,
          item.image,
          item.price,
          item.quantity,
          Math.round(item.price * item.quantity * 100) / 100
        );
      }

      // Clear cart
      if (userId) {
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
      } else {
        db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
      }

      db.exec('COMMIT;');
    } catch (txErr) {
      db.exec('ROLLBACK;');
      throw txErr;
    }

    res.status(201).json({
      success: true,
      message: 'Order processed successfully!',
      order: {
        id: orderId,
        orderNumber,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        shippingAddress: shippingAddress.trim(),
        paymentMethod: paymentMethod.trim(),
        paymentStatus,
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

    let orders;
    if (req.user && req.user.role === 'admin') {
      orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    } else if (userId) {
      orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    } else if (email) {
      orders = db.prepare('SELECT * FROM orders WHERE LOWER(customer_email) = LOWER(?) ORDER BY created_at DESC').all(email.trim());
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

// GET /api/orders/:orderNumber (Look up single order by number with ownership check)
app.get('/api/orders/:orderNumber', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Ownership check: Admin, owner user_id, or matching customer_email
    const isAdmin = req.user && req.user.role === 'admin';
    const isOwnerUser = req.user && order.user_id && req.user.id === order.user_id;
    const isOwnerEmail = (req.user && req.user.email.toLowerCase() === order.customer_email.toLowerCase()) ||
      (req.query.email && req.query.email.trim().toLowerCase() === order.customer_email.toLowerCase());

    if (!isAdmin && !isOwnerUser && !isOwnerEmail) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view this order.' });
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

// POST /api/orders/:id/cancel (Customer or admin cancel order with atomic restock)
app.post('/api/orders/:id/cancel', (req, res) => {
  try {
    const orderId = req.params.id;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Ownership check
    const isAdmin = req.user && req.user.role === 'admin';
    const isOwnerUser = req.user && order.user_id && req.user.id === order.user_id;
    const isOwnerEmail = (req.user && req.user.email.toLowerCase() === order.customer_email.toLowerCase()) ||
      (req.body.email && req.body.email.trim().toLowerCase() === order.customer_email.toLowerCase());

    if (!isAdmin && !isOwnerUser && !isOwnerEmail) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to cancel this order.' });
    }

    if (order.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'This order has already been cancelled.' });
    }

    if (order.status === 'Delivered') {
      return res.status(400).json({ success: false, message: 'Delivered orders cannot be cancelled. Please contact support for returns.' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      // Update status to Cancelled
      db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(orderId);

      // Restore inventory
      if (order.items_json) {
        const items = JSON.parse(order.items_json);
        for (const item of items) {
          const prodId = item.id || item.product_id;
          const qty = Number(item.quantity) || 1;
          if (prodId) {
            db.prepare('UPDATE products SET stock_count = stock_count + ? WHERE id = ?').run(qty, prodId);
          }
        }
      }
      db.exec('COMMIT;');
    } catch (txErr) {
      db.exec('ROLLBACK;');
      throw txErr;
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
    const allowed = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `Order status updated to ${status}` });
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

// ==========================================
// 5. COUPONS API
// ==========================================

// POST /api/coupons/validate
app.post('/api/coupons/validate', (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Promo code required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(cleanCode);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired promo code.' });
    }

    const minSpend = coupon.min_purchase || 0;
    if (subtotal < minSpend) {
      return res.status(400).json({
        success: false,
        message: `Coupon "${cleanCode}" requires a minimum purchase of $${minSpend.toFixed(2)}.`
      });
    }

    const discountAmount = Math.round(subtotal * (coupon.discount_percent / 100) * 100) / 100;
    res.json({
      success: true,
      code: coupon.code,
      discountPercent: coupon.discount_percent,
      discountAmount,
      message: `Coupon applied: ${coupon.discount_percent}% off!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/coupons
app.get('/api/admin/coupons', requireAuth, requireAdmin, (req, res) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/coupons
app.post('/api/admin/coupons', requireAuth, requireAdmin, (req, res) => {
  try {
    const { code, discount_percent, min_purchase = 0 } = req.body;
    if (!code || !discount_percent) {
      return res.status(400).json({ success: false, message: 'Code and discount percentage are required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM coupons WHERE code = ?').get(cleanCode);
    if (existing) {
      db.prepare('UPDATE coupons SET discount_percent = ?, min_purchase = ?, is_active = 1 WHERE id = ?')
        .run(Number(discount_percent), Number(min_purchase), existing.id);
      return res.status(200).json({ success: true, message: `Coupon "${cleanCode}" updated successfully.` });
    }

    db.prepare(`
      INSERT INTO coupons (code, discount_percent, min_purchase, is_active)
      VALUES (?, ?, ?, 1)
    `).run(cleanCode, Number(discount_percent), Number(min_purchase));

    res.status(201).json({ success: true, message: `Coupon "${cleanCode}" created successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/coupons/:id
app.delete('/api/admin/coupons/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Coupon deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 6. CONTACT & INQUIRIES API
// ==========================================

// POST /api/contact
app.post('/api/contact', (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All contact fields are required.' });
    }

    db.prepare(`
      INSERT INTO contact_messages (name, email, subject, message)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), email.trim(), subject.trim(), message.trim());

    res.status(201).json({
      success: true,
      message: 'Your inquiry has been logged. An engineering representative will reply within 24 hours.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/contacts
app.get('/api/admin/contacts', requireAuth, requireAdmin, (req, res) => {
  try {
    const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 7. COMPREHENSIVE ADMIN DASHBOARD & CUSTOMERS
// ==========================================

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', requireAuth, requireAdmin, (req, res) => {
  try {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const totalRevenue = db.prepare("SELECT SUM(total) as sum FROM orders WHERE status != 'Cancelled'").get().sum || 0;
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count;

    const recentOrders = db.prepare('SELECT id, order_number, customer_name, customer_email, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 6').all();
    const lowStock = db.prepare('SELECT id, name, category, price, stock_count FROM products WHERE stock_count <= 15 ORDER BY stock_count ASC LIMIT 5').all();

    res.json({
      success: true,
      metrics: {
        products: totalProducts,
        orders: totalOrders,
        revenue: Math.round(totalRevenue * 100) / 100,
        customers: totalUsers
      },
      recentOrders,
      lowStock
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/customers
app.get('/api/admin/customers', requireAuth, requireAdmin, (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
             COUNT(o.id) as total_orders,
             COALESCE(SUM(o.total), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    res.json({ success: true, customers });
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
