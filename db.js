const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'ecommerce.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for reliability and speed
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tagline TEXT,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      original_price REAL,
      rating REAL DEFAULT 4.8,
      reviews_count INTEGER DEFAULT 0,
      badge TEXT,
      image TEXT NOT NULL,
      gallery_json TEXT,
      description TEXT NOT NULL,
      features_json TEXT,
      stock_count INTEGER DEFAULT 30,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      shipping_fee REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'Processing',
      items_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT,
      product_image TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_percent REAL NOT NULL,
      min_purchase REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migrations for optional columns
  try {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
  } catch (e) {}

  try {
    db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'Paid';");
  } catch (e) {}

  // Seed default categories if empty
  try {
    const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
    if (catCount === 0) {
      const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
      insertCat.run('Audio', 'Studio reference acoustic hardware & planar drivers');
      insertCat.run('Wearables', 'Aerospace titanium wearables & biometric trackers');
      insertCat.run('Computing', 'Mechanical tactile decks & workstation accessories');
      insertCat.run('Cameras & Gear', 'Cinema rigs, stabilized gimbals & optical kits');
      insertCat.run('Smart Home', 'Ambient acoustic arrays & environmental monitors');
    }
  } catch (e) {
    console.error('Category seeding error:', e.message);
  }

  // Seed default coupons if table is empty
  const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get().count;
  if (couponCount === 0) {
    const insertCoupon = db.prepare('INSERT OR IGNORE INTO coupons (code, discount_percent, min_purchase) VALUES (?, ?, ?)');
    insertCoupon.run('ALPHA15', 15, 0);
    insertCoupon.run('ALPHA10', 10, 50);
    insertCoupon.run('WELCOME20', 20, 100);
    insertCoupon.run('CODEALPHA', 15, 0);
  }

  // Check if users exist; if not, seed default users
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const demoPasswordHash = bcrypt.hashSync('alpha123', salt);
    const adminPasswordHash = bcrypt.hashSync('admin123', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, avatar)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertUser.run('Alex Morgan', 'alex@alphastore.io', demoPasswordHash, 'customer', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80');
    insertUser.run('Admin Alpha', 'admin@alphastore.io', adminPasswordHash, 'admin', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80');
    // Also keep legacy aliases so old logins don't fail
    insertUser.run('Alex Morgan', 'user@codealpha.tech', demoPasswordHash, 'customer', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80');
    insertUser.run('Admin Alpha', 'admin@codealpha.tech', adminPasswordHash, 'admin', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80');
    console.log('Seeded demo users: alex@alphastore.io / admin@alphastore.io');
  }

  // Check if products exist; if not, seed products
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount === 0) {
    const seedProducts = [
      {
        name: 'Apex Pro Wireless Studio Headphones',
        tagline: 'Lossless Spatial Audio with Active Noise Cancellation',
        category: 'Audio',
        price: 299.99,
        original_price: 379.99,
        rating: 4.9,
        reviews_count: 142,
        badge: 'Best Seller',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Engineered for audiophiles and producers, the Apex Pro combines 45mm custom graphene acoustic drivers with hybrid active noise cancellation, 40-hour battery life, and ultra-plush memory foam earcups.',
        features: [
          'Spatial Audio with dynamic head tracking',
          'Hybrid Active Noise Cancellation (40dB reduction)',
          'Up to 40 hours battery life with fast charge (10 min = 5 hours)',
          'Seamless multipoint Bluetooth 5.3 connection',
          'Aero-grade aluminum and genuine memory foam construction'
        ],
        stock_count: 24,
        is_featured: 1
      },
      {
        name: 'Vanguard Ultra Series 9 Smartwatch',
        tagline: 'Titanium Case, Sapphire Glass & Advanced Health Sensor',
        category: 'Wearables',
        price: 399.00,
        original_price: 499.00,
        rating: 4.8,
        reviews_count: 98,
        badge: 'Staff Pick',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'The Vanguard Ultra is built for peak performance and extreme durability. Crafted with aerospace-grade titanium, 100m water resistance, dual-frequency GPS, and ECG heart & sleep health tracking.',
        features: [
          'Always-on 2000-nit Retina OLED display',
          'Aerospace-grade titanium casing with ceramic back',
          'Advanced sensors: ECG, SpO2, Heart Rate, Skin Temperature',
          'Up to 72 hours battery life in low-power mode',
          '100m water resistance with dive computer metrics'
        ],
        stock_count: 18,
        is_featured: 1
      },
      {
        name: 'NovaBook Aero 14 OLED Laptop',
        tagline: 'Ultra-thin, M-Series Performance with 2.8K 120Hz Display',
        category: 'Computing',
        price: 1249.00,
        original_price: 1499.00,
        rating: 4.9,
        reviews_count: 67,
        badge: 'New Arrival',
        image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Uncompromising portable power. Weighing just 1.1kg, the NovaBook Aero features a razor-sharp 2.8K 120Hz OLED screen, 16-core neural engine, 32GB LPDDR5X RAM, and all-day 18-hour battery endurance.',
        features: [
          '14.2" 2.8K 120Hz OLED display (100% DCI-P3 color gamut)',
          'Next-gen 8-Core processor with 16-Core AI Neural Engine',
          '32GB Unified Memory & 1TB PCIe 4.0 NVMe SSD',
          'Magnesium-aluminum unibody weighing only 1.15 kg',
          'Dual Thunderbolt 4 / USB4 ports with 100W PD charging'
        ],
        stock_count: 12,
        is_featured: 1
      },
      {
        name: 'ErgoCraft Mechanical Keyboard (RGB)',
        tagline: 'Hot-swappable Custom Gasket Mount with Wireless Tri-mode',
        category: 'Computing',
        price: 149.99,
        original_price: 189.99,
        rating: 4.7,
        reviews_count: 85,
        badge: 'Popular',
        image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Designed for tactile perfection. ErgoCraft features custom-lubed pre-lubed mechanical switches, five layers of sound dampening silicone foam, south-facing RGB, and ultra-durable PBT keycaps.',
        features: [
          'Gasket mount structure for cushioned, pleasant keystroke acoustics',
          'Tri-mode connectivity: 2.4GHz wireless, Bluetooth 5.1, and USB-C',
          'Hot-swappable PCB compatible with 3-pin and 5-pin switches',
          'Double-shot PBT cherry profile keycaps resistant to shine',
          '4000mAh battery providing up to 200 hours of cordless typing'
        ],
        stock_count: 45,
        is_featured: 0
      },
      {
        name: 'Lumix Pro 4K Cinema Drone',
        tagline: '3-Axis Gimbal, Hasselblad Color & 15km OcuSync Range',
        category: 'Cameras & Gear',
        price: 899.00,
        original_price: 1099.00,
        rating: 4.9,
        reviews_count: 53,
        badge: 'Top Rated',
        image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Capture Hollywood-grade aerial footage. Features a 1-inch CMOS sensor recording 4K/60fps HDR video, omnidirectional obstacle sensing, and 45-minute continuous flight time per charge.',
        features: [
          '1-inch 20MP sensor with f/2.8-f/11 adjustable aperture',
          '4K/60fps 10-bit D-Log M video recording',
          'Omnidirectional obstacle avoidance system with APAS 5.0',
          '45-minute maximum flight duration per battery pack',
          '15km FHD video transmission with anti-interference transmission'
        ],
        stock_count: 15,
        is_featured: 1
      },
      {
        name: 'SonicWave Hi-Fi Bluetooth Speaker',
        tagline: '360° Room-Filling Audio with Deep Bass Subwoofer',
        category: 'Audio',
        price: 119.50,
        original_price: 159.00,
        rating: 4.6,
        reviews_count: 112,
        badge: 'Sale -25%',
        image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Compact size with earth-shaking punch. Dual passive radiators and stereo tweeters project crystalline highs and rich lows. IPX7 waterproof rating makes it poolside and adventure-ready.',
        features: [
          '40W peak audio output with dual passive radiators',
          'IPX7 waterproof and dustproof submersible rating',
          '24 hours continuous playtime on a single charge',
          'True Wireless Stereo (TWS) pairing to sync two units',
          'Built-in power bank to charge mobile phones on the go'
        ],
        stock_count: 38,
        is_featured: 0
      },
      {
        name: 'Aura Gen-3 Health & Sleep Smart Ring',
        tagline: 'Discreet Titanium Biometric Tracker with 7-Day Battery',
        category: 'Wearables',
        price: 279.00,
        original_price: 329.00,
        rating: 4.7,
        reviews_count: 76,
        badge: 'Trending',
        image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Sleek, lightweight, and non-intrusive. The Aura Smart Ring measures sleep staging, readiness scores, heart rate variability (HRV), and body temperature with medical-grade precision.',
        features: [
          'Ultra-light 4-gram hypoallergenic medical-grade titanium',
          'Continuous heart rate, HRV, SpO2, and sleep cycle analytics',
          '7-day battery life with fast magnetic wireless charger',
          'Waterproof up to 100 meters (swimming & shower safe)',
          'AI-powered daily readiness and recovery insights'
        ],
        stock_count: 22,
        is_featured: 0
      },
      {
        name: 'Beacon Ambient Smart Glow Lamp',
        tagline: '16M Colors, Circadian Rhythm Sync & Matter Support',
        category: 'Smart Home',
        price: 89.99,
        original_price: 119.99,
        rating: 4.8,
        reviews_count: 64,
        badge: 'Eco-Smart',
        image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Transform your living space or desk setup. The Beacon lamp syncs dynamically with your circadian rhythms, changes moods with music, and integrates with Alexa, Google Home, and Apple HomeKit.',
        features: [
          '16 million vibrant RGB colors plus 2200K-6500K tunable white',
          'Dynamic music sync mode and animated gradient themes',
          'Circadian natural wake-up sunrise and sunset simulation',
          'Matter, Apple HomeKit, Google Home, and Alexa compatibility',
          'Premium frosted glass dome with matte aluminum base'
        ],
        stock_count: 50,
        is_featured: 0
      },
      {
        name: 'PrecisionMaster Wireless Gaming Mouse',
        tagline: '58g Featherweight with 30,000 DPI Optical Sensor',
        category: 'Computing',
        price: 79.99,
        original_price: 99.99,
        rating: 4.9,
        reviews_count: 129,
        badge: 'Best Seller',
        image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Built for eSports dominance and ergonomic comfort. Zero lag 4000Hz polling rate, ultra-smooth virgin PTFE skates, optical switches rated for 90 million clicks, and zero honeycomb holes.',
        features: [
          'Flawless 30K DPI Optical Sensor with 750 IPS tracking',
          'Ultra-lightweight 58-gram balanced unibody shell',
          'True 4000Hz hyper-polling rate wireless dongle included',
          'Optical switches with 0.2ms actuation and zero double-click issues',
          'Up to 90 hours battery life with rapid USB-C charging'
        ],
        stock_count: 32,
        is_featured: 0
      },
      {
        name: 'AeroPure Smart HEPA Air Purifier',
        tagline: 'H13 True HEPA with Real-time PM2.5 Air Quality Sensor',
        category: 'Smart Home',
        price: 189.00,
        original_price: 229.00,
        rating: 4.7,
        reviews_count: 41,
        badge: 'Healthy Living',
        image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Clean, fresh air for rooms up to 600 sq ft. Cleans 99.97% of dust, pet dander, pollen, smoke, and odors in under 15 minutes. Whisper-quiet night mode operates at just 22dB.',
        features: [
          '3-stage filtration: Pre-filter, H13 True HEPA, and Activated Carbon',
          'Laser PM2.5 particle sensor with live color-coded LED air ring',
          'Whisper-quiet sleep mode (22dB) with dimmed display',
          'Cleans up to 600 sq ft in 15 minutes (CADR 260 m³/h)',
          'Smart companion app for schedule automations and filter reminders'
        ],
        stock_count: 20,
        is_featured: 0
      },
      {
        name: 'Horizon 360 Waterproof Action Cam',
        tagline: '5.7K 360° Video with FlowState Horizon Leveling',
        category: 'Cameras & Gear',
        price: 449.99,
        original_price: 529.99,
        rating: 4.8,
        reviews_count: 62,
        badge: 'Action Ready',
        image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Never miss the action again. Shoot immersive 360-degree footage in 5.7K and reframe later with AI. Waterproof down to 10 meters without an extra housing.',
        features: [
          '5.7K 30fps 360° capture + 4K 60fps single-lens action mode',
          'FlowState 6-axis stabilization with 360-degree Horizon Lock',
          'Rugged IPX8 waterproof down to 10m (33ft) out of the box',
          'Invisible selfie stick effect for third-person drone-like shots',
          'Dual ultra-bright touchscreens for effortless framing'
        ],
        stock_count: 16,
        is_featured: 0
      },
      {
        name: 'Pulse Studio Wireless In-Ear Monitors',
        tagline: 'Dual Balanced Armatures with Custom Acoustic Tuning',
        category: 'Audio',
        price: 179.00,
        original_price: 219.00,
        rating: 4.7,
        reviews_count: 88,
        badge: 'Editor Choice',
        image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80',
        gallery: [
          'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80'
        ],
        description: 'Studio-grade audio engineered into ergonomic earbuds. Features Knowles balanced armatures + dynamic driver hybrid setup for crisp highs, warm mids, and punchy lows.',
        features: [
          'Hybrid Dual Driver setup (10mm dynamic + balanced armature)',
          'Lossless LDAC & aptX Adaptive high-resolution audio codecs',
          'Customizable EQ presets via CodeAlpha Sound Companion',
          '8 hours listening + 28 hours charging case reserve',
          'IPX5 sweat and splash resistance'
        ],
        stock_count: 28,
        is_featured: 0
      }
    ];

    const insertProd = db.prepare(`
      INSERT INTO products (
        name, tagline, category, price, original_price, rating, reviews_count,
        badge, image, gallery_json, description, features_json, stock_count, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertReview = db.prepare(`
      INSERT INTO reviews (product_id, user_name, rating, comment)
      VALUES (?, ?, ?, ?)
    `);

    for (const p of seedProducts) {
      const info = insertProd.run(
        p.name,
        p.tagline,
        p.category,
        p.price,
        p.original_price,
        p.rating,
        p.reviews_count,
        p.badge,
        p.image,
        JSON.stringify(p.gallery),
        p.description,
        JSON.stringify(p.features),
        p.stock_count,
        p.is_featured
      );

      const prodId = Number(info.lastInsertRowid);

      // Seed 2 realistic reviews for each product
      insertReview.run(
        prodId,
        'David K.',
        5,
        'Exceeded my expectations! Build quality is top-notch and delivery took only 2 days. Highly recommended.'
      );
      insertReview.run(
        prodId,
        'Sarah T.',
        p.rating >= 4.8 ? 5 : 4,
        'Great value for the price. The design looks very modern and works flawlessly with my other devices.'
      );
    }
    console.log(`Seeded ${seedProducts.length} initial products and reviews.`);
  }

  // Check if sample order exists; if not, create one for demonstration
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  if (orderCount === 0) {
    const demoItems = [
      {
        id: 1,
        name: 'Apex Pro Wireless Studio Headphones',
        price: 299.99,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80'
      }
    ];

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_number, user_id, customer_name, customer_email,
        shipping_address, payment_method, subtotal, discount, shipping_fee, total,
        status, items_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOrder.run(
      'CA-2026-8492',
      1,
      'Alex Morgan',
      'user@codealpha.tech',
      '742 Evergreen Terrace, Springfield, IL 62704, United States',
      'Credit Card (ending 4242)',
      299.99,
      30.00,
      0,
      269.99,
      'Shipped',
      JSON.stringify(demoItems)
    );
    console.log('Seeded sample order: CA-2026-8492');
  }
}

// Call initDatabase on load
initDatabase();

module.exports = {
  db
};
