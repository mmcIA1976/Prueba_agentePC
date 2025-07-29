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
  addTestButton(); // Agregar botón de prueba después del login
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

// --- Voice Recognition Integration ---
let recognition = null;
let isRecording = false;

function initializeVoiceRecognition() {
  console.log('🎤 Inicializando reconocimiento de voz...');

  // Verificar si Web Speech API está disponible
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

        // Enviar automáticamente el mensaje transcrito
        sendTranscribedMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.error('❌ Error en reconocimiento de voz:', event.error);
      isRecording = false;
      updateMicButton();

      let errorMsg = 'Error en el reconocimiento de voz';
      switch(event.error) {
        case 'no-speech':
          errorMsg = 'No se detectó voz. Intenta hablar más claro.';
          break;
        case 'audio-capture':
          errorMsg = 'No se pudo acceder al micrófono.';
          break;
        case 'not-allowed':
          errorMsg = 'Permisos de micrófono denegados.';
          break;
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
  console.log('📢 Función de voz no disponible');
  const micButton = document.getElementById('mic-button');
  if (micButton) {
    micButton.style.opacity = '0.5';
    micButton.style.cursor = 'not-allowed';
    micButton.title = 'Función de voz no disponible en este navegador';
  }
}

// Función para enviar mensaje transcrito automáticamente
async function sendTranscribedMessage(message) {
  if (!message.trim()) return;

  showLoadingSpinner();

  try {
    console.log('Enviando mensaje transcrito a N8N:', message);
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
    const data = await response.json();

    hideLoadingSpinner();

    // --- Compatibilidad con respuesta anidada tipo [{output: { ... }}] ---
    const _out = Array.isArray(data) && data.length && data[0] ? data[0] : data;

    // ---- DEBUGGING: Analizar respuesta para mensaje transcrito ----
    console.log('🎤 Respuesta para mensaje transcrito:', JSON.stringify(data, null, 2));

    // ---- DEBUGGING: Verificar respuesta transcrita para audio ----
    console.log('🔍 Analizando respuesta transcrita para audio:', JSON.stringify(_out, null, 2));
    
    // ---- Reproducir audio si viene en la respuesta ----
    if (_out && _out.data) {
      console.log('📊 Campo "data" encontrado en transcripción:', typeof _out.data, _out.data.substring(0, 100));
      
      if (typeof _out.data === 'string' && _out.data.startsWith('data:audio/')) {
        console.log('🔊 Reproduciendo audio de respuesta transcrita...');
        playAudioFromData(_out.data);
      } else {
        console.log('❌ Campo "data" no es audio válido en transcripción');
        appendMessage('Sistema', '❌ Datos recibidos pero no son audio válido');
      }
    } else {
      console.log('❌ No hay campo "data" con audio en respuesta transcrita');
      // Verificar otros posibles campos de audio
      const possibleAudioFields = ['audio', 'audioData', 'sound', 'voice', 'audio_data'];
      let audioFound = false;
      possibleAudioFields.forEach(field => {
        if (_out && _out[field]) {
          console.log(`🔍 Campo "${field}" encontrado en transcripción:`, typeof _out[field], _out[field].substring(0, 100));
          if (typeof _out[field] === 'string' && _out[field].startsWith('data:audio/')) {
            console.log(`🔊 Reproduciendo audio desde campo "${field}" en transcripción...`);
            playAudioFromData(_out[field]);
            audioFound = true;
          }
        }
      });
      
      if (!audioFound) {
        appendMessage('Sistema', '📝 Solo texto recibido - sin audio');
      }
    }

    if (_out && _out.isConfigFinal === true && _out.config_final) {
      renderConfiguracion(_out.config_final);
    } else {
      configContainer.innerHTML = '';
    }

    if (_out.output && typeof _out.output === "string") {
      appendMessage('Agente', _out.output);
      await saveMessageToDB('Agente', _out.output);
    }
    if (_out.respuesta) {
      appendMessage('Agente', _out.respuesta);
      await saveMessageToDB('Agente', _out.respuesta);
    }
    if (!_out.respuesta && !_out.config_final && !_out.output) {
      appendMessage('Agente', 'No se recibió respuesta del agente.');
    }

  } catch (error) {
    hideLoadingSpinner();
    appendMessage('Agente', `Error de conexión: ${error.message}`);
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

// --- FUNCIÓN DE PRUEBA DE AUDIO ---
function testAudioPlayback() {
  console.log('🧪 Probando reproducción de audio...');
  
  try {
    // Crear un audio de prueba simple con HTML5
    const testAudio = document.createElement('audio');
    testAudio.preload = 'auto';
    
    // URL de un audio de prueba público y corto (notification sound)
    testAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSyO0/DMdiMFl3bK7+ONQQ0VYLXn57BdGQU+ltryxnkpBSl+zO7eizEJEV2w5OWlUBELUKXh77BdGAY9k9n0unkoAAA=';
    
    testAudio.volume = 0.5;
    
    testAudio.addEventListener('canplaythrough', () => {
      console.log('✅ Audio de prueba cargado correctamente');
      testAudio.play().then(() => {
        console.log('✅ Prueba de audio HTML5 exitosa');
        appendMessage('Sistema', '🧪 ✅ Prueba de audio exitosa - Deberías escuchar un sonido');
      }).catch(error => {
        console.error('❌ Error reproduciendo audio de prueba:', error);
        appendMessage('Sistema', '❌ Error en reproducción de prueba: ' + error.message);
      });
    });
    
    testAudio.addEventListener('error', (e) => {
      console.error('❌ Error cargando audio de prueba:', e);
      appendMessage('Sistema', '❌ Error cargando audio de prueba');
    });
    
    // Cargar el audio
    testAudio.load();
    
  } catch (error) {
    console.error('❌ Error en prueba de audio:', error);
    appendMessage('Sistema', '❌ Error general en la prueba de audio: ' + error.message);
  }
}

// Agregar botón de prueba después del login
function addTestButton() {
  const chatContainer = document.getElementById('chat-container');
  if (chatContainer && !document.getElementById('test-audio-btn')) {
    const testBtn = document.createElement('button');
    testBtn.id = 'test-audio-btn';
    testBtn.textContent = '🧪 Probar Audio';
    testBtn.style.cssText = 'margin: 10px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;';
    testBtn.onclick = testAudioPlayback;
    chatContainer.insertBefore(testBtn, chatContainer.firstChild);
  }
}

// --- Inicializar la aplicación ---
document.addEventListener('DOMContentLoaded', () => {
  showLoginScreen();

  // Verificar si estamos en el entorno desplegado
  const isDeploy = window.location.hostname.includes('.replit.app') || window.location.hostname.includes('.replit.dev');
  console.log('🌐 Entorno detectado:', isDeploy ? 'Replit Deploy' : 'Replit Preview');

  // Event listener para el botón del micrófono
  const micButton = document.getElementById('mic-button');
  if (micButton) {
    micButton.addEventListener('click', toggleRecording);
    updateMicButton(); // Inicial styling
  }

  // Inicializar reconocimiento de voz cuando se carga la página
  setTimeout(() => {
    console.log('🚀 Iniciando reconocimiento de voz...');
    initializeVoiceRecognition();
  }, 1000);
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
      const _out = Array.isArray(data) && data.length && data[0] ? data[0] : data;

      // ---- DEBUGGING COMPLETO: Verificar estructura completa ----
      console.log('🔍 Respuesta RAW de N8N:', JSON.stringify(data, null, 2));
      console.log('🔍 Respuesta procesada (_out):', JSON.stringify(_out, null, 2));
      console.log('🔍 Campos disponibles en _out:', Object.keys(_out || {}));
      
      // Verificar TODOS los posibles campos de audio
      const audioFields = ['data', 'audio', 'audioData', 'sound', 'voice', 'audio_data', 'audioUrl', 'audio_url', 'file', 'attachment', 'media'];
      audioFields.forEach(field => {
        if (_out && _out[field]) {
          console.log(`📊 Campo "${field}" encontrado:`, typeof _out[field], 
            typeof _out[field] === 'string' ? _out[field].substring(0, 100) + '...' : _out[field]);
        }
      });
      
      // ---- Reproducir audio si viene en la respuesta ----
      if (_out && _out.data) {
        console.log('📊 Campo "data" encontrado:', typeof _out.data, _out.data.substring(0, 100));
        
        if (typeof _out.data === 'string' && _out.data.startsWith('data:audio/')) {
          console.log('🔊 Reproduciendo audio de respuesta...');
          playAudioFromData(_out.data);
        } else {
          console.log('❌ Campo "data" no es audio válido. Tipo:', typeof _out.data);
          console.log('❌ Primeros 200 caracteres:', _out.data ? _out.data.substring(0, 200) : 'null/undefined');
        }
      } else {
        console.log('❌ No se encontró campo "data" en la respuesta');
        // Verificar otros posibles campos de audio
        const possibleAudioFields = ['audio', 'audioData', 'sound', 'voice', 'audio_data'];
        possibleAudioFields.forEach(field => {
          if (_out && _out[field]) {
            console.log(`🔍 Campo "${field}" encontrado:`, typeof _out[field], _out[field].substring(0, 100));
            if (typeof _out[field] === 'string' && _out[field].startsWith('data:audio/')) {
              console.log(`🔊 Reproduciendo audio desde campo "${field}"...`);
              playAudioFromData(_out[field]);
            }
          }
        });
      }

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

// --- REPRODUCIR AUDIO DESDE DATA CON FALLBACK HTML5 ---
function playAudioFromData(audioData) {
  try {
    console.log('🎵 Iniciando reproducción de audio...');
    console.log('📊 Longitud de datos:', audioData ? audioData.length : 0);

    // Validar que tenemos datos de audio válidos
    if (!audioData || typeof audioData !== 'string') {
      console.error('❌ Datos de audio inválidos:', typeof audioData);
      appendMessage('Sistema', '❌ Datos de audio inválidos');
      return;
    }

    // Verificar si es un data URL válido
    if (!audioData.startsWith('data:audio/')) {
      console.error('❌ No es un data URL de audio válido');
      appendMessage('Sistema', '❌ Formato de audio no válido');
      return;
    }

    console.log('✅ Formato de audio detectado:', audioData.substring(5, audioData.indexOf(';')));

    // Crear controles de audio HTML5 (más compatible con MP3)
    const audioContainer = document.createElement('div');
    audioContainer.className = 'audio-player-container';
    
    const audioId = 'audio_' + Date.now();
    const sizeKB = Math.round((audioData.length * 0.75) / 1024); // Estimación del tamaño
    
    audioContainer.innerHTML = `
      <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 10px 0; border: 2px solid #4CAF50;">
        🔊 <strong>Respuesta de Audio:</strong><br>
        <div style="margin: 10px 0;">
          <audio id="html-audio-${audioId}" controls style="width: 100%; max-width: 400px;">
            <source src="${audioData}" type="audio/mpeg">
            Tu navegador no soporta el elemento de audio.
          </audio>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
          <button id="play-btn-${audioId}" onclick="playHtmlAudio('${audioId}')" 
                  style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
            ▶️ Reproducir
          </button>
          <button id="pause-btn-${audioId}" onclick="pauseHtmlAudio('${audioId}')" 
                  style="background: #ff9500; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
            ⏸️ Pausar
          </button>
          <button id="stop-btn-${audioId}" onclick="stopHtmlAudio('${audioId}')" 
                  style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
            ⏹️ Detener
          </button>
          <div id="status-${audioId}" style="margin-left: 10px; font-size: 12px; color: #666;">
            Listo para reproducir
          </div>
        </div>
        <div style="margin-top: 8px; font-size: 12px; color: #666;">
          Formato: MP3 | Tamaño: ~${sizeKB}KB
        </div>
      </div>
    `;

    // Añadir controles al chat
    chatLog.appendChild(audioContainer);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Crear funciones globales para control de HTML5 Audio
    window.playHtmlAudio = function(audioId) {
      try {
        const audio = document.getElementById(`html-audio-${audioId}`);
        const status = document.getElementById(`status-${audioId}`);
        
        if (!audio) {
          console.error('❌ Elemento de audio no encontrado');
          return;
        }

        status.textContent = 'Reproduciendo...';
        
        audio.play().then(() => {
          console.log('✅ Reproducción iniciada con HTML5 Audio');
          appendMessage('Sistema', '🎵 ¡Audio reproduciéndose correctamente!');
        }).catch(error => {
          console.error('❌ Error al reproducir HTML5 Audio:', error);
          status.textContent = `Error: ${error.message}`;
          appendMessage('Sistema', `❌ Error de reproducción: ${error.message}`);
        });
        
      } catch (error) {
        console.error('❌ Error en playHtmlAudio:', error);
        appendMessage('Sistema', `❌ Error al controlar audio: ${error.message}`);
      }
    };

    window.pauseHtmlAudio = function(audioId) {
      try {
        const audio = document.getElementById(`html-audio-${audioId}`);
        const status = document.getElementById(`status-${audioId}`);
        
        if (audio) {
          audio.pause();
          status.textContent = 'Pausado';
          console.log('⏸️ Audio pausado');
        }
      } catch (error) {
        console.error('❌ Error al pausar audio:', error);
      }
    };

    window.stopHtmlAudio = function(audioId) {
      try {
        const audio = document.getElementById(`html-audio-${audioId}`);
        const status = document.getElementById(`status-${audioId}`);
        
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
          status.textContent = 'Detenido';
          console.log('⏹️ Audio detenido');
        }
      } catch (error) {
        console.error('❌ Error al detener audio:', error);
      }
    };

    // Configurar eventos del elemento audio
    const audioElement = document.getElementById(`html-audio-${audioId}`);
    if (audioElement) {
      audioElement.addEventListener('loadeddata', () => {
        console.log('✅ Audio cargado correctamente');
        document.getElementById(`status-${audioId}`).textContent = 'Audio cargado - Listo';
      });

      audioElement.addEventListener('error', (e) => {
        console.error('❌ Error cargando audio:', e);
        document.getElementById(`status-${audioId}`).textContent = 'Error al cargar audio';
        appendMessage('Sistema', '❌ Error al cargar el audio. Verifica el formato.');
      });

      audioElement.addEventListener('ended', () => {
        console.log('🏁 Reproducción terminada');
        document.getElementById(`status-${audioId}`).textContent = 'Reproducción completada';
      });
    }

    // Intentar reproducción automática después de un breve delay
    setTimeout(() => {
      console.log('🚀 Intentando reproducción automática...');
      window.playHtmlAudio(audioId);
    }, 1000);

    appendMessage('Sistema', '🔊 Audio procesado con HTML5 - Reproduciendo automáticamente...');

  } catch (error) {
    console.error('❌ Error en playAudioFromData:', error);
    appendMessage('Sistema', `❌ Error al procesar el audio: ${error.message}`);
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