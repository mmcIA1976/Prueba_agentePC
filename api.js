
const ConfiguradorDB = require('./database');
const db = new ConfiguradorDB();

// Simulamos endpoints (para usar con fetch desde el frontend)
class ConfiguradorAPI {
  // Inicializar usuario
  static initUser(replitUser) {
    try {
      db.createUser(replitUser);
      return { success: true, user: db.getUser(replitUser.id) };
    } catch (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  }

  // Guardar mensaje de chat
  static saveMessage(chatId, author, content, userId) {
    try {
      // Crear chat si no existe
      const user = db.getUser(userId);
      if (user) {
        db.createChat(chatId, user.id);
        db.saveMessage(chatId, author, content);
        return { success: true };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error saving message:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtener datos del dashboard
  static getDashboardData(userId) {
    try {
      const user = db.getUser(userId);
      if (user) {
        return { success: true, data: db.getUserDashboardData(userId) };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtener historial de chats
  static getUserChats(userId) {
    try {
      const user = db.getUser(userId);
      if (user) {
        return { success: true, chats: db.getUserChats(user.id) };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error getting user chats:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtener mensajes de un chat
  static getChatMessages(chatId, userId) {
    try {
      const user = db.getUser(userId);
      if (user) {
        return { success: true, messages: db.getChatMessages(chatId) };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error getting chat messages:', error);
      return { success: false, error: error.message };
    }
  }

  // Guardar configuración
  static saveConfiguration(userId, chatId, title, components, totalPrice) {
    try {
      const user = db.getUser(userId);
      if (user) {
        const result = db.saveConfiguration(user.id, chatId, title, components, totalPrice);
        return { success: true, configId: result.lastInsertRowid };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error saving configuration:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtener configuraciones del usuario
  static getUserConfigurations(userId) {
    try {
      const user = db.getUser(userId);
      if (user) {
        return { success: true, configurations: db.getUserConfigurations(user.id) };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error getting user configurations:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ConfiguradorAPI;
