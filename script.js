// Variables globales
let currentUser = null;
let chatId = null;

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const configContainer = document.getElementById('config-container');
const fotosContainer = document.getElementById('fotos-container');

const N8N_API_URL = "https://mauriciomeseguer.up.railway.app/webhook/bf351844-0718-4d84-bd9c-e5fbea35a83b";

// Llamadas a la API local del servidor Express
async function callLocalAPI(endpoint, data) {
  try {
    const url = `/api/${endpoint.replace('init-user', 'init-user').replace('save-message', 'save-message')}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`✅ API Call: ${endpoint}`, result);
    return result;
  } catch (error) {
    console.error(`❌ Error en API Call ${endpoint}:`, error);
    return { success: false, error: error.message };
  }
}

// Función de login de Replit
function LoginWithReplit() {
  window.addEventListener("message", authComplete);
  var h = 500;
  var w = 350;
  var left = screen.width / 2 - w / 2;
  var top = screen.height / 2 - h / 2;

  // Usar el hostname correcto para Replit Auth
  var domain = window.location.hostname;
  console.log('🔐 Intentando login con dominio:', domain);

  var authWindow = window.open(
    "https://replit.com/auth_with_repl_site?domain=" + domain,
    "_blank",
    "modal=yes, toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=" +
      w + ", height=" + h + ", top=" + top + ", left=" + left
  );

  function authComplete(e) {
    if (e.data !== "auth_complete") return;
    window.removeEventListener("message", authComplete);
    authWindow.close();
    checkAuth();
  }
}

// Verificar autenticación
async function checkAuth() {
  try {
    console.log('🔍 Verificando autenticación...');
    const response = await fetch('/__replauthuser');
    
    if (response.ok) {
      const user = await response.json();
      console.log('✅ Usuario autenticado:', user);
      
      if (user && user.id) {
        currentUser = user;
        chatId = generateChatId();
        
        // Inicializar usuario en base de datos local
        await initializeUser(user);
        
        showMainApp();
        updateUserUI();
      } else {
        console.log('❌ No se encontró usuario válido');
        showLoginScreen();
      }
    } else {
      console.log('❌ Respuesta de auth no OK:', response.status);
      showLoginScreen();
    }
  } catch (error) {
    console.error('❌ Error al verificar autenticación:', error);
    showLoginScreen();
  }
}

// Generar ID único de chat
function generateChatId() {
  return `${currentUser.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Mostrar pantalla de login
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

// Mostrar app principal
function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
}

// Actualizar UI del usuario
function updateUserUI() {
  if (currentUser) {
    document.getElementById('user-avatar').src = currentUser.profileImage || 'https://api.dicebear.com/7.x/personas/svg?seed=' + currentUser.id;
    document.getElementById('user-name').textContent = currentUser.name || 'Usuario';
  }
}

// Cerrar sesión
function logout() {
  currentUser = null;
  chatId = null;
  showLoginScreen();
}

// Inicializar usuario en base de datos
async function initializeUser(replitUser) {
  try {
    await callLocalAPI('init-user', replitUser);
    console.log('Usuario inicializado en base de datos:', replitUser.name);
  } catch (error) {
    console.error('Error al inicializar usuario:', error);
  }
}

// Guardar mensaje en base de datos local
async function saveMessageToDB(author, content) {
  try {
    await callLocalAPI('save-message', {
      chatId: chatId,
      author: author,
      content: content,
      userId: currentUser ? currentUser.id : null
    });
  } catch (error) {
    console.error('Error al guardar mensaje:', error);
  }
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', checkAuth);

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  appendMessage('Tú', message);
  
  // Guardar mensaje del usuario en BD
  await saveMessageToDB('Tú', message);
  
  chatInput.value = '';

  // Mostrar spinner de carga
  showLoadingSpinner();

  try {
    console.log('Enviando mensaje a N8N:', message);
    
    const response = await fetch(N8N_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        mensaje: message,
        user_id: currentUser ? currentUser.id : null,
        chat_id: chatId,
        user_name: currentUser ? currentUser.name : 'Usuario'
      })
    });

    console.log('Estado de respuesta:', response.status);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    console.log('Respuesta de N8N:', data);
    
    hideLoadingSpinner();

    // Si el webhook de n8n responde con 'configuracion_final' como objeto
    if (data.configuracion_final) {
      renderConfiguracion(data.configuracion_final);
    }

    // Si responde con 'output' (formato actual de tu N8N)
    if (data.output) {
      appendMessage('Agente', data.output);
      // Guardar respuesta del agente en BD
      await saveMessageToDB('Agente', data.output);
    }

    // Si responde con 'respuesta' para mostrar mensaje de chat del agente
    if (data.respuesta) {
      appendMessage('Agente', data.respuesta);
      // Guardar respuesta del agente en BD
      await saveMessageToDB('Agente', data.respuesta);
    }

    // Si responde con ambos o ninguno, controla ambos casos
    if (!data.respuesta && !data.configuracion_final && !data.output) {
      console.log('Respuesta vacía o formato incorrecto:', data);
      appendMessage('Agente', 'No se recibió respuesta del agente. (Revisa el flujo de n8n)');
    }

  } catch (error) {
    console.error('Error al conectar con N8N:', error);
    hideLoadingSpinner();
    appendMessage('Agente', `Error de conexión: ${error.message}`);
  }
});

function appendMessage(author, text) {
  const div = document.createElement('div');
  let avatarImg, clase;
  if (author === 'Tú') {
    avatarImg = '<img class="avatar" src="https://api.dicebear.com/7.x/personas/svg?seed=user" alt="User">';
    clase = 'chat-message user';
  } else {
    avatarImg = '<img class="avatar" src="https://api.dicebear.com/7.x/bottts/svg?seed=robot" alt="IA">';
    clase = 'chat-message agent';
  }
  div.className = clase;
  div.innerHTML = `${avatarImg}<div>${text}</div>`;
  chatLog.appendChild(div);
  // AUTOSCROLL vertical al último mensaje
  chatLog.scrollTop = chatLog.scrollHeight;
}

let loadingSpinnerElement = null;

function showLoadingSpinner() {
  const div = document.createElement('div');
  div.className = 'loading-spinner';
  div.innerHTML = `
    <img class="avatar" src="https://api.dicebear.com/7.x/bottts/svg?seed=robot" alt="IA">
    <div class="spinner"></div>
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  loadingSpinnerElement = div;
}

function hideLoadingSpinner() {
  if (loadingSpinnerElement) {
    chatLog.removeChild(loadingSpinnerElement);
    loadingSpinnerElement = null;
  }
}

function renderConfiguracion(config) {
  configContainer.innerHTML = '';
  fotosContainer.innerHTML = '';
  config.componentes.forEach(comp => {
    // Box de texto
    configContainer.innerHTML += `
      <div class="componente-box">
        <strong>${comp.nombre}</strong>
        <p>${comp.descripcion}</p>
      </div>
    `;
    // Foto del componente
    if (comp.imagen) {
      fotosContainer.innerHTML += `
        <div class="componente-foto">
          <img src="${comp.imagen}" alt="${comp.nombre}" />
        </div>
      `;
    }
  });
}
