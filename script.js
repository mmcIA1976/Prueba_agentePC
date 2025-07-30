// ---- VARIABLES GLOBALES ----
let currentUser = null;
let chatId = null;
let recognition = null;
let isRecording = false;
let loadingSpinnerElement = null;

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const configContainer = document.getElementById('config-container');
const fotosContainer = document.getElementById('fotos-container');
const manualLoginForm = document.getElementById('manual-login-form');
const userNameInput = document.getElementById('user-name-input');
const userEmailInput = document.getElementById('user-email-input');

const N8N_API_URL = "https://mauriciomeseguer.up.railway.app/webhook/bf351844-0718-4d84-bd9c-e5fbea35a83b";

// --- UTILIDADES ---
function cleanText(text) {
  return text.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ@.\-_\s]/g, '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateChatId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// --- LLAMADAS API LOCAL ---
async function callLocalAPI(endpoint, data) {
  try {
    const response = await fetch(`/api/${endpoint}`, {
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

// --- LOGIN Y NAVEGACIÓN ---
manualLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanText(userNameInput.value);
  const email = cleanText(userEmailInput.value).toLowerCase();

  if (name.length < 2 || name.length > 32) {
    alert('Pon un nombre válido (2-32 caracteres).');
    return;
  }
  if (!isValidEmail(email) || email.length > 60) {
    alert('Pon un email válido (hasta 60 caracteres).');
    return;
  }

  currentUser = { id: email, name: name, email: email, profileImage: '' };
  chatId = generateChatId();

  // Guardar en localStorage
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  localStorage.setItem('chatId', chatId);

  await initializeUser(currentUser);
  showMainApp();
  updateUserUI();
});

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  if (chatLog) chatLog.innerHTML = '';
  if (configContainer) configContainer.innerHTML = '';
  if (fotosContainer) fotosContainer.innerHTML = '';
  manualLoginForm.reset();
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
}

function updateUserUI() {
  if (currentUser) {
    document.getElementById('user-avatar').src = `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(currentUser.name)}`;
    document.getElementById('user-name').textContent = currentUser.name || 'Usuario';
  }
}

function logout() {
  currentUser = null;
  chatId = null;
  localStorage.removeItem('currentUser');
  localStorage.removeItem('chatId');
  showLoginScreen();
}

// Verificar si hay sesión guardada
function checkExistingSession() {
  const savedUser = localStorage.getItem('currentUser');
  const savedChatId = localStorage.getItem('chatId');
  
  if (savedUser && savedChatId) {
    try {
      currentUser = JSON.parse(savedUser);
      chatId = savedChatId;
      console.log('✅ Sesión restaurada:', currentUser.name);
      showMainApp();
      updateUserUI();
      return true;
    } catch (error) {
      console.error('❌ Error al restaurar sesión:', error);
      localStorage.removeItem('currentUser');
      localStorage.removeItem('chatId');
    }
  }
  return false;
}

// --- BASE DE DATOS ---
async function initializeUser(usuario) {
  try {
    await callLocalAPI('init-user', usuario);
    console.log('Usuario inicializado en base de datos:', usuario.name);
  } catch (error) {
    console.error('Error al inicializar usuario:', error);
  }
}

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

// --- RECONOCIMIENTO DE VOZ ---
function initializeVoiceRecognition() {
  console.log('🎤 Inicializando reconocimiento de voz...');

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onstart = () => {
      console.log('🎤 Reconocimiento de voz iniciado');
      isRecording = true;
      updateMicButton();
      appendMessage('Sistema', '🎤 Escuchando... Habla ahora');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        }
      }

      if (finalTranscript.trim()) {
        console.log('📝 Transcripción final:', finalTranscript);
        appendMessage('Tú', finalTranscript.trim());
        saveMessageToDB('Tú', finalTranscript.trim());
        sendMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.error('❌ Error en reconocimiento de voz:', event.error);
      isRecording = false;
      updateMicButton();

      let errorMsg = 'Error en el reconocimiento de voz';
      switch(event.error) {
        case 'no-speech': errorMsg = 'No se detectó voz. Intenta hablar más claro.'; break;
        case 'audio-capture': errorMsg = 'No se pudo acceder al micrófono.'; break;
        case 'not-allowed': errorMsg = 'Permisos de micrófono denegados.'; break;
      }
      appendMessage('Sistema', `❌ ${errorMsg}`);
    };

    recognition.onend = () => {
      console.log('⏹️ Reconocimiento de voz terminado');
      isRecording = false;
      updateMicButton();
      appendMessage('Sistema', '⏹️ Reconocimiento de voz detenido');
    };

    console.log('✅ Reconocimiento de voz configurado correctamente');
    setupVoiceButton();
  } else {
    console.log('❌ Web Speech API no disponible en este navegador');
    showVoiceUnavailable();
  }
}

function setupVoiceButton() {
  const micButton = document.getElementById('mic-button');
  if (micButton) {
    micButton.style.opacity = '1';
    micButton.style.cursor = 'pointer';
    micButton.title = 'Hablar (reconocimiento de voz)';
  }
}

function showVoiceUnavailable() {
  const micButton = document.getElementById('mic-button');
  if (micButton) {
    micButton.style.opacity = '0.5';
    micButton.style.cursor = 'not-allowed';
    micButton.title = 'Función de voz no disponible en este navegador';
  }
}

function updateMicButton() {
  const micButton = document.getElementById('mic-button');
  if (!micButton) return;

  if (isRecording) {
    micButton.textContent = '⏹️';
    micButton.classList.add('recording');
    micButton.title = 'Detener conversación';
    micButton.style.backgroundColor = '#ff4757';
  } else {
    micButton.textContent = '🎤';
    micButton.classList.remove('recording');
    micButton.title = 'Iniciar conversación';
    micButton.style.backgroundColor = '#2ed573';
  }
}

function toggleRecording() {
  if (!recognition) {
    console.log('❌ Reconocimiento de voz no disponible');
    appendMessage('Sistema', '❌ Función de voz no disponible en este navegador');
    return;
  }

  if (!isRecording) {
    console.log('🎤 Iniciando reconocimiento de voz...');
    try {
      recognition.start();
    } catch (error) {
      console.error('Error al iniciar reconocimiento:', error);
      appendMessage('Sistema', '❌ No se pudo iniciar el reconocimiento de voz');
    }
  } else {
    console.log('⏹️ Deteniendo reconocimiento de voz...');
    recognition.stop();
  }
}

// --- ENVÍO DE MENSAJES (UNIFICADO) ---
async function sendMessage(message) {
  if (!message.trim()) return;

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

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const contentType = response.headers.get('Content-Type');
    console.log('🔍 Content-Type de respuesta:', contentType);

    let data;
    let audioBinaryData = null;

    if (contentType && contentType.includes('audio/')) {
      console.log('🎵 Respuesta es audio binario');
      audioBinaryData = await response.arrayBuffer();
      data = { audio_binary: true };
    } else {
      console.log('📄 Respuesta es JSON');
      data = await response.json();
    }

    hideLoadingSpinner();

    // Manejar audio binario
    if (audioBinaryData) {
      console.log('🎵 Procesando audio binario:', audioBinaryData.byteLength, 'bytes');

      const textFromHeader = response.headers.get('x-response-text') || 
                            response.headers.get('x-output-text') || 
                            response.headers.get('x-agent-message');

      if (textFromHeader) {
        console.log('📝 ✅ Texto encontrado en header:', textFromHeader);
        appendMessage('Agente', textFromHeader);
        await saveMessageToDB('Agente', textFromHeader);
      } else {
        console.log('❌ No se encontró texto en headers para audio binario');
      }

      playBinaryAudio(audioBinaryData);
      return;
    }

    // Procesar respuesta JSON
    const _out = Array.isArray(data) && data.length && data[0] ? data[0] : data;

    // Mostrar configuración si existe
    if (_out && _out.isConfigFinal === true && _out.config_final) {
      renderConfiguracion(_out.config_final);
    } else {
      configContainer.innerHTML = '';
    }

    // Mostrar texto del agente
    let textoMostrado = false;

    if (_out && _out.output && typeof _out.output === "string" && _out.output.trim()) {
      console.log('📝 ✅ Mostrando texto del campo "output"');
      appendMessage('Agente', _out.output);
      await saveMessageToDB('Agente', _out.output);
      textoMostrado = true;
    }

    if (!textoMostrado && !_out.config_final) {
      console.log('❌ No se encontró texto válido en respuesta');
      console.log('🔍 Campos disponibles en _out:', Object.keys(_out || {}));
      appendMessage('Agente', 'No se recibió respuesta del agente.');
    }</textoMostrado>

  } catch (error) {
    hideLoadingSpinner();
    appendMessage('Agente', `Error de conexión: ${error.message}`);
  }
}

// --- AUDIO ---
function playBinaryAudio(audioArrayBuffer) {
  try {
    console.log('🎵 Reproduciendo audio binario:', audioArrayBuffer.byteLength, 'bytes');

    const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioContainer = document.getElementById('audio-container');

    if (audioContainer) {
      const audioId = 'binary_audio_' + Date.now();

      audioContainer.innerHTML = `
        <div class="external-audio-player binary-audio">
          <div class="audio-header">
            <div class="audio-title">
              <span style="font-size: 1.5em;">🎵</span>
              <strong>Audio de Respuesta</strong>
            </div>
            <button onclick="toggleAudioPlayer()" class="audio-toggle-btn">➖ Minimizar</button>
          </div>
          <div class="audio-content" id="audio-content">
            <div class="audio-player-wrapper">
              <audio id="audio-${audioId}" controls preload="auto">
                <source src="${audioUrl}" type="audio/mpeg">
              </audio>
            </div>
            <div class="audio-controls">
              <button onclick="document.getElementById('audio-${audioId}').play()" class="audio-btn play-btn">▶️ Reproducir</button>
              <button onclick="downloadBinaryAudio('${audioUrl}')" class="audio-btn download-btn">📥 Descargar</button>
            </div>
            <div id="status-${audioId}" class="audio-status">✅ Audio cargado</div>
          </div>
        </div>
      `;

      audioContainer.style.display = 'block';

      const audioElement = document.getElementById(`audio-${audioId}`);
      const statusElement = document.getElementById(`status-${audioId}`);

      if (audioElement && statusElement) {
        audioElement.addEventListener('loadeddata', () => {
          console.log('✅ Audio cargado y listo');
          statusElement.textContent = '✅ Audio listo';

          setTimeout(() => {
            const playPromise = audioElement.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('🎵 Audio reproduciéndose automáticamente');
                  statusElement.textContent = '🎵 Reproduciendo...';
                })
                .catch(() => {
                  statusElement.textContent = '⚠️ Haz clic en ▶️ para reproducir';
                });
            }
          }, 500);
        });

        audioElement.addEventListener('ended', () => {
          statusElement.textContent = '🏁 Reproducción completada';
        });

        audioElement.addEventListener('error', () => {
          statusElement.textContent = '❌ Error al reproducir';
        });
      }
    }

    setTimeout(() => URL.revokeObjectURL(audioUrl), 600000);

  } catch (error) {
    console.error('❌ Error procesando audio:', error);
    appendMessage('Sistema', `❌ Error al procesar audio: ${error.message}`);
  }
}

// --- UI HELPERS ---
function appendMessage(author, text) {
  const div = document.createElement('div');
  const avatarImg = author === 'Tú' 
    ? '<img class="avatar" src="https://api.dicebear.com/7.x/personas/svg?seed=user" alt="User">'
    : '<img class="avatar" src="https://api.dicebear.com/7.x/bottts/svg?seed=robot" alt="IA">';

  div.className = `chat-message ${author === 'Tú' ? 'user' : 'agent'}`;
  div.innerHTML = `${avatarImg}<div>${text}</div>`;
  chatLog.appendChild(div);

  if (author === 'Agente' && text.length > 250) {
    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

function showLoadingSpinner() {
  const div = document.createElement('div');
  div.className = 'loading-spinner';
  div.innerHTML = `
    <img class="avatar" src="https://api.dicebear.com/7.x/bottts/svg?seed=robot" alt="IA">
    <div class="spinner"></div>
    <div class="loading-dots"><span></span><span></span><span></span></div>
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

// --- CONFIGURACIÓN ---
function renderConfiguracion(config_final) {
  configContainer.innerHTML = '';
  fotosContainer.innerHTML = '';

  if (!config_final || !Array.isArray(config_final)) return;

  const opcionesValidas = config_final.filter(opt => Array.isArray(opt.componentes) && opt.componentes.length);
  if (opcionesValidas.length === 0) return;

  opcionesValidas.forEach(option => {
    const title = option.nombre ? `<h3>${option.nombre} ${option.total ? `- ${option.total}` : ''}</h3>` : '';
    let html = `<div class="config-option">${title}<ul>`;

    option.componentes.forEach(comp => {
      html += `<li>
        <b>${comp.tipo || comp.nombre || ''}:</b> ${comp.modelo || comp.descripcion || ''}
        ${comp.precio ? `<span> · <b>${comp.precio}</b></span>` : ''}
        ${comp.url ? ` · <a href="${comp.url}" target="_blank">Comprar</a>` : ''}
      </li>`;
    });

    html += '</ul></div>';
    configContainer.innerHTML += html;
  });
}

// --- FUNCIONES GLOBALES ---
window.downloadBinaryAudio = function(blobUrl) {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `audio_respuesta_${Date.now()}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.toggleAudioPlayer = function() {
  const audioContent = document.getElementById('audio-content');
  const toggleBtn = document.querySelector('.audio-toggle-btn');

  if (audioContent && toggleBtn) {
    if (audioContent.style.display === 'none') {
      audioContent.style.display = 'block';
      toggleBtn.textContent = '➖ Minimizar';
    } else {
      audioContent.style.display = 'none';
      toggleBtn.textContent = '➕ Expandir';
    }
  }
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  // Verificar si hay sesión activa primero
  const hasSession = checkExistingSession();
  
  // Solo mostrar login si no hay sesión
  if (!hasSession) {
    showLoginScreen();
  }

  // Event listeners
  const micButton = document.getElementById('mic-button');
  if (micButton) {
    micButton.addEventListener('click', toggleRecording);
    updateMicButton();
  }

  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = chatInput.value.trim();
      if (!message) return;

      appendMessage('Tú', message);
      await saveMessageToDB('Tú', message);
      chatInput.value = '';

      await sendMessage(message);
    });
  }

  // Inicializar reconocimiento de voz
  setTimeout(() => {
    console.log('🚀 Iniciando reconocimiento de voz...');
    initializeVoiceRecognition();
  }, 1000);
});