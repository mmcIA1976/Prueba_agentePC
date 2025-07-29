// ---- VARIABLES GLOBALES ----
let currentUser = null;
let chatId = null;

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const configContainer = document.getElementById('config-container');
const fotosContainer = document.getElementById('fotos-container');

const manualLoginForm = document.getElementById('manual-login-form');
const userNameInput = document.getElementById('user-name-input');
const userEmailInput = document.getElementById('user-email-input');

const N8N_API_URL = "https://mauriciomeseguer.up.railway.app/webhook/bf351844-0718-4d84-bd9c-e5fbea35a83b";

// --- LIMPIEZA Y VALIDACIÓN ---
function cleanText(text) {
  return text.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ@.\-_\s]/g, '').trim();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- LOGIN MANUAL ---
manualLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  let name = cleanText(userNameInput.value);
  let email = cleanText(userEmailInput.value).toLowerCase();

  if (name.length < 2 || name.length > 32) {
    alert('Pon un nombre válido (2-32 caracteres).');
    return;
  }
  if (!isValidEmail(email) || email.length > 60) {
    alert('Pon un email válido (hasta 60 caracteres).');
    return;
  }

  currentUser = {
    id: email,
    name: name,
    email: email,
    profileImage: ''
  };
  chatId = generateChatId();

  await initializeUser(currentUser);

  // --- ENVÍA nombre y chatId a N8N tras login ---
  fetch("https://mauriciomeseguer.up.railway.app/webhook/bf351844-0718-4d84-bd9c-e5fbea35a83b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_name: name,
      chat_id: chatId
    })
  })
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);

  showMainApp();
  updateUserUI();
});

// --- LLAMADAS API LOCAL EXPRESS ---
async function callLocalAPI(endpoint, data) {
  try {
    const url = `/api/${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    console.log(`✅ API Call: ${endpoint}`, result);
    return result;
  } catch (error) {
    console.error(`❌ Error en API Call ${endpoint}:`, error);
    return { success: false, error: error.message };
  }
}

// --- Generar ID único de chat ---
function generateChatId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// --- Mostrar pantalla de login ---
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  if (chatLog) chatLog.innerHTML = '';
  if (configContainer) configContainer.innerHTML = '';
  if (fotosContainer) fotosContainer.innerHTML = '';
  manualLoginForm.reset();
}

// --- Mostrar app principal ---
function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
}

// --- Actualizar UI del usuario ---
function updateUserUI() {
  if (currentUser) {
    document.getElementById('user-avatar').src =
      `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(currentUser.name)}`;
    document.getElementById('user-name').textContent = currentUser.name || 'Usuario';
  }
}

// --- Cerrar sesión ---
function logout() {
  currentUser = null;
  chatId = null;
  showLoginScreen();
}

// --- Inicializar usuario en base de datos ---
async function initializeUser(usuario) {
  try {
    await callLocalAPI('init-user', usuario);
    console.log('Usuario inicializado en base de datos:', usuario.name);
  } catch (error) {
    console.error('Error al inicializar usuario:', error);
  }
}

// --- Guardar mensaje en base de datos local ---
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

// --- VAPI Integration ---
let vapi = null;
let isRecording = false;

function initializeVAPI() {
  // Esperar a que VAPI esté disponible
  if (typeof window.Vapi !== 'undefined') {
    try {
      vapi = new window.Vapi("b7395881-a803-4c64-97c2-2e167ad1633c");
      
      console.log('✅ VAPI inicializado correctamente');

      // Eventos de VAPI
      vapi.on('call-start', () => {
        console.log('Llamada iniciada');
        isRecording = true;
        updateMicButton();
        appendMessage('Sistema', '🎤 Conversación iniciada...');
      });

      vapi.on('call-end', () => {
        console.log('Llamada terminada');
        isRecording = false;
        updateMicButton();
        appendMessage('Sistema', '📞 Conversación terminada');
      });

      vapi.on('speech-start', () => {
        console.log('Usuario empezó a hablar');
      });

      vapi.on('speech-end', () => {
        console.log('Usuario terminó de hablar');
      });

      vapi.on('message', (message) => {
        console.log('Mensaje VAPI:', message);
        
        if (message.type === 'transcript' && message.transcriptType === 'final') {
          if (message.transcript) {
            appendMessage('Tú', message.transcript);
            saveMessageToDB('Tú', message.transcript);
          }
        }
        
        if (message.type === 'function-call') {
          console.log('Function call:', message);
        }
        
        if (message.type === 'conversation-update') {
          console.log('Conversation update:', message);
        }
      });

      vapi.on('error', (error) => {
        console.error('Error VAPI:', error);
        appendMessage('Sistema', `❌ Error: ${error.message || 'Error de conexión'}`);
        isRecording = false;
        updateMicButton();
      });

    } catch (error) {
      console.error('❌ Error al inicializar VAPI:', error);
    }
  } else {
    console.log('⏳ VAPI no disponible aún, reintentando...');
    setTimeout(initializeVAPI, 1000);
  }
}

// Función para actualizar el botón del micrófono
function updateMicButton() {
  const micButton = document.getElementById('mic-button');
  if (!micButton) return;
  
  if (isRecording) {
    micButton.textContent = '⏹️';
    micButton.classList.add('recording');
    micButton.title = 'Detener conversación';
    micButton.style.backgroundColor = '#ff4757';
    micButton.style.color = 'white';
  } else {
    micButton.textContent = '🎤';
    micButton.classList.remove('recording');
    micButton.title = 'Iniciar conversación';
    micButton.style.backgroundColor = '#2ed573';
    micButton.style.color = 'white';
  }
}

// Función para el botón del micrófono
function toggleRecording() {
  if (!vapi) {
    appendMessage('Sistema', '❌ VAPI no está disponible. Recargando página...');
    setTimeout(() => location.reload(), 2000);
    return;
  }

  if (!isRecording) {
    console.log('🎤 Iniciando conversación...');
    vapi.start("ed7107e6-3fa0-43c7-8440-5bf0d6765a10");
  } else {
    console.log('⏹️ Deteniendo conversación...');
    vapi.stop();
  }
}

// --- Inicializar la aplicación ---
document.addEventListener('DOMContentLoaded', () => {
  showLoginScreen();
  
  // Inicializar VAPI cuando se carga la página
  setTimeout(() => {
    initializeVAPI();
    
    // Event listener para el botón del micrófono
    const micButton = document.getElementById('mic-button');
    if (micButton) {
      micButton.addEventListener('click', toggleRecording);
      updateMicButton(); // Inicial styling
    }
  }, 2000);
});

// --- Chat envío de mensajes ---
if (chatForm) {
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    appendMessage('Tú', message);
    await saveMessageToDB('Tú', message);
    chatInput.value = '';
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
      if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
      const data = await response.json();
      console.log('Respuesta de N8N:', data);
      hideLoadingSpinner();

      // --- Compatibilidad con respuesta anidada tipo [{output: { ... }}] ---
      const _out = Array.isArray(data) && data.length && data[0].output ? data[0].output : data;

      // ---- Mostrar configuración final solo si corresponde ----
      if (_out && _out.isConfigFinal === true && _out.config_final) {
        renderConfiguracion(_out.config_final);
      } else {
        configContainer.innerHTML = '';
      }

      // ---- Chat "normal" sigue igual (solo muestra si output es string) ----
      if (_out.output && typeof _out.output === "string") {
        appendMessage('Agente', _out.output);
        await saveMessageToDB('Agente', _out.output);
      }
      if (_out.respuesta) {
        appendMessage('Agente', _out.respuesta);
        await saveMessageToDB('Agente', _out.respuesta);
      }
      if (!_out.respuesta && !_out.config_final && !_out.output) {
        appendMessage('Agente', 'No se recibió respuesta del agente. (Revisa el flujo de n8n)');
      }
    } catch (error) {
      hideLoadingSpinner();
      appendMessage('Agente', `Error de conexión: ${error.message}`);
    }
  });
}

// --- UI helpers ---
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

  if (author === 'Agente' && text.length > 250) {
    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    chatLog.scrollTop = chatLog.scrollHeight;
  }
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

// --- MOSTRAR CONFIGURACION FINAL FUERA DEL CHAT ---
function renderConfiguracion(config_final) {
  configContainer.innerHTML = ''; // Limpiar anterior
  fotosContainer.innerHTML = '';

  if (!config_final || !Array.isArray(config_final)) {
    configContainer.innerHTML = ''; // Nada que mostrar
    return;
  }

  // Filtra solo las opciones que tienen al menos un componente (por si hay una vacía)
  const opcionesValidas = config_final.filter(opt => Array.isArray(opt.componentes) && opt.componentes.length);

  // Si NO hay ninguna opción válida, no muestra nada
  if (opcionesValidas.length === 0) {
    configContainer.innerHTML = '<div class="config-option"><em>No se encontró configuración final para mostrar.</em></div>';
    return;
  }

  // Renderiza todas las opciones válidas (AMD, Intel, etc.)
  opcionesValidas.forEach(option => {
    const title = option.nombre ? `<h3>${option.nombre} ${option.total ? `- ${option.total}` : ''}</h3>` : '';
    let html = `<div class="config-option">${title}<ul>`;
    option.componentes.forEach(comp => {
      html += `<li>
        <b>${comp.tipo || comp.nombre || ''}:</b> ${comp.modelo || comp.descripcion || ''}
        ${comp.precio ? `<span> · <b>${comp.precio}</b></span>` : ''}
        ${comp.url ? ` · <a href="${comp.url}" target="_blank" rel="noopener">Comprar</a>` : ''}
      </li>`;
    });
    html += '</ul></div>';
    configContainer.innerHTML += html;
  });
} 