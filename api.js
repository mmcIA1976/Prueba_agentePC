const ConfiguradorDB = require('./database');
const db = new ConfiguradorDB();

// API endpoints para el backend Express
class ConfiguradorAPI {
  // Inicializar o actualizar usuario (por user_id = email)
  static initUser(userObj) {
    try {
      db.createUser(userObj);
      const user = db.getUserByReplitId(userObj.id); // userObj.id es el email (user_id)
      return { success: true, user };
    } catch (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  }

  // Guardar mensaje de chat (y crea chat si no existe)
  static saveMessage(chatId, author, content, userId) {
    try {
      const user = db.getUserByReplitId(userId);
      if (user) {
        db.createChat(chatId, userId);
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
      const user = db.getUserByReplitId(userId);
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
      const user = db.getUserByReplitId(userId);
      if (user) {
        return { success: true, chats: db.getUserChats(userId) };
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
      const user = db.getUserByReplitId(userId);
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
      const user = db.getUserByReplitId(userId);
      if (user) {
        const result = db.saveConfiguration(userId, chatId, title, components, totalPrice);
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
      const user = db.getUserByReplitId(userId);
      if (user) {
        return { success: true, configurations: db.getUserConfigurations(userId) };
      }
      return { success: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('Error getting user configurations:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ConfiguradorAPI;
