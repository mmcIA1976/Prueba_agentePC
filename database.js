// database.js
const Database = require('better-sqlite3');

class ConfiguradorDB {
  constructor() {
    this.db = new Database('./configurador.db');
    this.initTables();
  }

  initTables() {
    // Tabla de usuarios
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        replit_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        email TEXT,
        profile_image TEXT,
        preferences TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de chats
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        title TEXT DEFAULT 'Nueva conversación',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Tabla de mensajes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_type TEXT DEFAULT 'text',
        FOREIGN KEY (chat_id) REFERENCES chats (chat_id)
      )
    `);

    // Tabla de configuraciones
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chat_id TEXT,
        title TEXT NOT NULL,
        components TEXT NOT NULL,
        total_price DECIMAL(10,2),
        currency TEXT DEFAULT 'EUR',
        status TEXT DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_favorite BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (chat_id) REFERENCES chats (chat_id)
      )
    `);

    // Tabla de favoritos/wishlist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        component_name TEXT NOT NULL,
        component_data TEXT NOT NULL,
        price_alert DECIMAL(10,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);
  }

  // --- USUARIOS ---

  // Crear o actualizar usuario usando replit_id (único)
  createUser(replitUser) {
    const stmt = this.db.prepare(`
      INSERT INTO users (replit_id, username, email, profile_image, last_login)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(replit_id) DO UPDATE SET
        username = excluded.username,
        email = excluded.email,
        profile_image = excluded.profile_image,
        last_login = CURRENT_TIMESTAMP
    `);
    return stmt.run(replitUser.id, replitUser.name, replitUser.email, replitUser.profileImage);
  }

  // Buscar usuario por replit_id (¡USAR ESTO EN TODOS LOS FLUJOS!)
  getUserByReplitId(replitId) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE replit_id = ?');
    return stmt.get(replitId);
  }

  // Buscar usuario por id interno (solo si hace falta)
  getUserById(id) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  // --- CHATS ---

  createChat(chatId, replitId, title = 'Nueva conversación') {
    const user = this.getUserByReplitId(replitId);
    if (!user) throw new Error('Usuario no encontrado');
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO chats (chat_id, user_id, title)
      VALUES (?, ?, ?)
    `);
    return stmt.run(chatId, user.id, title);
  }

  getUserChats(replitId) {
    const user = this.getUserByReplitId(replitId);
    if (!user) return [];
    const stmt = this.db.prepare(`
      SELECT c.*, COUNT(m.id) as message_count
      FROM chats c
      LEFT JOIN messages m ON c.chat_id = m.chat_id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `);
    return stmt.all(user.id);
  }

  // --- MENSAJES ---

  saveMessage(chatId, author, content, messageType = 'text') {
    const stmt = this.db.prepare(`
      INSERT INTO messages (chat_id, author, content, message_type)
      VALUES (?, ?, ?, ?)
    `);

    const updateChat = this.db.prepare(`
      UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?
    `);

    const result = stmt.run(chatId, author, content, messageType);
    updateChat.run(chatId);
    return result;
  }

  getChatMessages(chatId) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC
    `);
    return stmt.all(chatId);
  }

  // --- CONFIGURACIONES ---

  saveConfiguration(replitId, chatId, title, components, totalPrice) {
    const user = this.getUserByReplitId(replitId);
    if (!user) throw new Error('Usuario no encontrado');
    const stmt = this.db.prepare(`
      INSERT INTO configurations (user_id, chat_id, title, components, total_price)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(user.id, chatId, title, JSON.stringify(components), totalPrice);
  }

  getUserConfigurations(replitId) {
    const user = this.getUserByReplitId(replitId);
    if (!user) return [];
    const stmt = this.db.prepare(`
      SELECT * FROM configurations WHERE user_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(user.id).map(config => ({
      ...config,
      components: JSON.parse(config.components)
    }));
  }

  // --- WISHLIST ---

  addToWishlist(replitId, componentName, componentData, priceAlert = null) {
    const user = this.getUserByReplitId(replitId);
    if (!user) throw new Error('Usuario no encontrado');
    const stmt = this.db.prepare(`
      INSERT INTO wishlist (user_id, component_name, component_data, price_alert)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(user.id, componentName, JSON.stringify(componentData), priceAlert);
  }

  getUserWishlist(replitId) {
    const user = this.getUserByReplitId(replitId);
    if (!user) return [];
    const stmt = this.db.prepare(`
      SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(user.id).map(item => ({
      ...item,
      component_data: JSON.parse(item.component_data)
    }));
  }

  // --- DASHBOARD ---

  getUserDashboardData(replitId) {
    const user = this.getUserByReplitId(replitId);
    if (!user) return {};
    const chats = this.getUserChats(replitId).slice(0, 5); // Últimos 5 chats
    const configurations = this.getUserConfigurations(replitId).slice(0, 3); // Últimas 3 configs
    const wishlistCount = this.getUserWishlist(replitId).length;

    return {
      user,
      recent_chats: chats,
      recent_configurations: configurations,
      wishlist_count: wishlistCount,
      total_chats: chats.length,
      total_configurations: configurations.length
    };
  }
}

module.exports = ConfiguradorDB;
