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
    
    // ---- Reproducir audio si viene en la respuesta (URLs de Google Drive) ----
    let audioUrl = null;
    
    // Buscar URL de audio en diferentes campos
    const transcriptionAudioFields = ['data', 'audio', 'audioUrl', 'audio_url', 'audioData', 'sound', 'voice', 'audio_data', 'file', 'attachment', 'media'];
    
    for (const field of transcriptionAudioFields) {
      if (_out && _out[field]) {
        console.log(`📊 Campo "${field}" encontrado en transcripción:`, typeof _out[field], _out[field]);
        
        // Verificar si es una URL de Google Drive o cualquier URL de audio
        if (typeof _out[field] === 'string' && 
            (_out[field].includes('drive.google.com') || 
             _out[field].includes('googleusercontent.com') ||
             _out[field].startsWith('http') ||
             _out[field].startsWith('data:audio/'))) {
          audioUrl = _out[field];
          console.log(`🔊 URL de audio encontrada en transcripción, campo "${field}":`, audioUrl);
          break;
        }
      }
    }
    
    if (audioUrl) {
      console.log('🎵 Reproduciendo audio transcrito...');
      playSimpleAudio(audioUrl);
    } else {
      console.log('❌ No se encontró audio válido en respuesta transcrita');
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

// --- Función simplificada para reproducir audio ---
function playSimpleAudio(audioData) {
  try {
    console.log('🎵 Reproduciendo audio con método simplificado...');
    
    const audioId = 'audio_' + Date.now();
    const audioContainer = document.createElement('div');
    audioContainer.className = 'audio-response-container';
    audioContainer.innerHTML = `
      <div style="background: #e8f5e8; padding: 12px; border-radius: 8px; margin: 10px 0; border: 2px solid #4CAF50;">
        🔊 <strong>Respuesta de Audio</strong> <span id="status-${audioId}" style="color: #666;">Preparando...</span>
        <audio id="audio-${audioId}" controls preload="auto" style="width: 100%; margin-top: 8px;">
          <source src="${audioData}" type="audio/mpeg">
          <source src="${audioData}" type="audio/mp3">
          Tu navegador no soporta audio HTML5.
        </audio>
      </div>
    `;

    chatLog.appendChild(audioContainer);
    chatLog.scrollTop = chatLog.scrollHeight;

    const audioElement = document.getElementById(`audio-${audioId}`);
    const statusElement = document.getElementById(`status-${audioId}`);
    
    if (audioElement && statusElement) {
      
      audioElement.addEventListener('loadstart', () => {
        console.log('🔄 Cargando audio...');
        statusElement.textContent = 'Cargando...';
        statusElement.style.color = '#666';
      });

      audioElement.addEventListener('canplay', () => {
        console.log('✅ Audio listo para reproducir');
        statusElement.textContent = 'Listo - Reproduciendo...';
        statusElement.style.color = '#4CAF50';
        
        // Intentar reproducción automática
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('✅ Reproducción automática exitosa');
            appendMessage('Sistema', '🎵 Audio reproduciéndose automáticamente');
          }).catch(error => {
            console.log('⚠️ Autoplay bloqueado:', error.message);
            statusElement.textContent = 'Haz clic en ▶️ para reproducir';
            statusElement.style.color = '#ff9800';
          });
        }
      });

      audioElement.addEventListener('play', () => {
        console.log('▶️ Reproducción iniciada');
        statusElement.textContent = 'Reproduciendo...';
        statusElement.style.color = '#4CAF50';
      });

      audioElement.addEventListener('ended', () => {
        console.log('🏁 Reproducción completada');
        statusElement.textContent = 'Completado ✅';
        statusElement.style.color = '#4CAF50';
      });

      audioElement.addEventListener('error', (e) => {
        console.error('❌ Error de audio:', e);
        console.error('❌ Código de error:', audioElement.error ? audioElement.error.code : 'desconocido');
        statusElement.textContent = `Error: ${audioElement.error ? audioElement.error.code : 'desconocido'}`;
        statusElement.style.color = '#f44336';
      });

      // Forzar carga del audio
      audioElement.load();
    }

  } catch (error) {
    console.error('❌ Error en playSimpleAudio:', error);
    appendMessage('Sistema', `❌ Error al procesar audio: ${error.message}`);
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
      
      // ---- Reproducir audio si viene en la respuesta (URLs de Google Drive) ----
      let audioUrl = null;
      
      // Buscar URL de audio en diferentes campos
      const supportedAudioFields = ['data', 'audio', 'audioUrl', 'audio_url', 'audioData', 'sound', 'voice', 'audio_data', 'file', 'attachment', 'media'];
      
      for (const field of supportedAudioFields) {
        if (_out && _out[field]) {
          console.log(`📊 Campo "${field}" encontrado:`, typeof _out[field], _out[field]);
          
          // Verificar si es una URL de Google Drive o cualquier URL de audio
          if (typeof _out[field] === 'string' && 
              (_out[field].includes('drive.google.com') || 
               _out[field].includes('googleusercontent.com') ||
               _out[field].startsWith('http') ||
               _out[field].startsWith('data:audio/'))) {
            audioUrl = _out[field];
            console.log(`🔊 URL de audio encontrada en campo "${field}":`, audioUrl);
            break;
          }
        }
      }
      
      if (audioUrl) {
        console.log('🎵 Reproduciendo audio desde datos...');
        playSimpleAudio(audioUrl);
      } else {
        console.log('❌ No se encontró audio válido en la respuesta');
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

// --- REPRODUCIR AUDIO DESDE URL (Google Drive, etc.) ---
function playAudioFromUrl(audioUrl) {
  try {
    console.log('🎵 Iniciando reproducción de audio desde URL...');
    console.log('📊 URL de audio:', audioUrl);

    // Validar que tenemos una URL válida
    if (!audioUrl || typeof audioUrl !== 'string') {
      console.error('❌ URL de audio inválida:', typeof audioUrl);
      appendMessage('Sistema', '❌ URL de audio inválida');
      return;
    }

    // Convertir URL de Google Drive si es necesario
    let finalUrl = audioUrl;
    if (audioUrl.includes('drive.google.com/file/d/')) {
      const fileId = audioUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
      if (fileId) {
        finalUrl = `https://drive.google.com/uc?export=download&id=${fileId[1]}`;
        console.log('🔧 URL de Google Drive convertida:', finalUrl);
      }
    }

    // Crear elemento de audio simple que se reproduce automáticamente
    const audioId = 'audio_' + Date.now();
    
    const audioContainer = document.createElement('div');
    audioContainer.className = 'audio-player-container';
    audioContainer.innerHTML = `
      <div style="background: #e8f5e8; padding: 10px; border-radius: 8px; margin: 10px 0; border: 2px solid #4CAF50;">
        🔊 <strong>Respuesta de Audio:</strong> <span id="status-${audioId}">Cargando...</span>
        <audio id="audio-${audioId}" controls autoplay style="width: 100%; margin-top: 8px;">
          <source src="${finalUrl}" type="audio/mpeg">
          <source src="${finalUrl}" type="audio/mp3">
          Tu navegador no soporta el elemento de audio.
        </audio>
      </div>
    `;

    // Añadir al chat
    chatLog.appendChild(audioContainer);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Configurar eventos del audio
    const audioElement = document.getElementById(`audio-${audioId}`);
    const statusElement = document.getElementById(`status-${audioId}`);
    
    if (audioElement) {
      audioElement.addEventListener('loadstart', () => {
        console.log('🔄 Comenzando a cargar audio...');
        statusElement.textContent = 'Cargando audio...';
      });

      audioElement.addEventListener('canplay', () => {
        console.log('✅ Audio listo para reproducir');
        statusElement.textContent = 'Reproduciendo automáticamente...';
        
        // Intentar reproducción automática
        audioElement.play().then(() => {
          console.log('✅ Reproducción automática iniciada');
          appendMessage('Sistema', '🎵 ¡Audio reproduciéndose automáticamente!');
        }).catch(error => {
          console.error('❌ Error en reproducción automática:', error);
          statusElement.textContent = 'Haz clic en play para reproducir';
          appendMessage('Sistema', '▶️ Audio listo - Haz clic en play para reproducir');
        });
      });

      audioElement.addEventListener('play', () => {
        console.log('▶️ Audio comenzó a reproducirse');
        statusElement.textContent = 'Reproduciendo...';
      });

      audioElement.addEventListener('pause', () => {
        console.log('⏸️ Audio pausado');
        statusElement.textContent = 'Pausado';
      });

      audioElement.addEventListener('ended', () => {
        console.log('🏁 Reproducción terminada');
        statusElement.textContent = 'Reproducción completada';
      });

      audioElement.addEventListener('error', (e) => {
        console.error('❌ Error cargando audio:', e);
        statusElement.textContent = 'Error al cargar audio';
        appendMessage('Sistema', '❌ Error al cargar el audio. Verifica la URL.');
      });
    }

    appendMessage('Sistema', '🔊 Audio de Google Drive cargado - Reproduciéndose automáticamente...');

  } catch (error) {
    console.error('❌ Error en playAudioFromUrl:', error);
    appendMessage('Sistema', `❌ Error al procesar el audio: ${error.message}`);
  }
}

// Mantener la función anterior para compatibilidad con base64
function playAudioFromData(audioData) {
  // Si es una URL, usar la nueva función
  if (audioData && typeof audioData === 'string' && audioData.startsWith('http')) {
    playAudioFromUrl(audioData);
    return;
  }
  
  // Si es base64, procesarlo como antes pero simplificado
  try {
    console.log('🎵 Reproduciendo audio base64...');
    const audioId = 'audio_' + Date.now();
    
    const audioContainer = document.createElement('div');
    audioContainer.innerHTML = `
      <div style="background: #e8f5e8; padding: 10px; border-radius: 8px; margin: 10px 0; border: 2px solid #4CAF50;">
        🔊 <strong>Respuesta de Audio:</strong>
        <audio controls autoplay style="width: 100%; margin-top: 8px;">
          <source src="${audioData}" type="audio/mpeg">
        </audio>
      </div>
    `;
    
    chatLog.appendChild(audioContainer);
    chatLog.scrollTop = chatLog.scrollHeight;
    
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