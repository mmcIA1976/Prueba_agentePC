
const express = require('express');
const path = require('path');
const ConfiguradorAPI = require('./api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Servir archivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoints de la API
app.post('/api/init-user', (req, res) => {
  const result = ConfiguradorAPI.initUser(req.body);
  res.json(result);
});

app.post('/api/save-message', (req, res) => {
  const { chatId, author, content, userId } = req.body;
  const result = ConfiguradorAPI.saveMessage(chatId, author, content, userId);
  res.json(result);
});

app.get('/api/dashboard/:userId', (req, res) => {
  const { userId } = req.params;
  const result = ConfiguradorAPI.getDashboardData(parseInt(userId));
  res.json(result);
});

app.get('/api/chats/:userId', (req, res) => {
  const { userId } = req.params;
  const result = ConfiguradorAPI.getUserChats(parseInt(userId));
  res.json(result);
});

app.get('/api/chat-messages/:chatId/:userId', (req, res) => {
  const { chatId, userId } = req.params;
  const result = ConfiguradorAPI.getChatMessages(chatId, parseInt(userId));
  res.json(result);
});

app.post('/api/save-configuration', (req, res) => {
  const { userId, chatId, title, components, totalPrice } = req.body;
  const result = ConfiguradorAPI.saveConfiguration(userId, chatId, title, components, totalPrice);
  res.json(result);
});

app.get('/api/configurations/:userId', (req, res) => {
  const { userId } = req.params;
  const result = ConfiguradorAPI.getUserConfigurations(parseInt(userId));
  res.json(result);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 Chat con N8N funcionando correctamente`);
  console.log(`💾 Base de datos SQLite inicializada`);
});
