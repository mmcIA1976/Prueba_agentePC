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
      playAudioReliable(audioUrl);
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

// --- Función única y confiable para reproducir audio ---
function playAudioReliable(audioData) {
  try {
    console.log('🎵 Reproduciendo audio desde N8N:', typeof audioData);
    console.log('📊 URL completa del audio:', audioData);
    
    // Convertir URL de Google Drive si es necesario
    let finalAudioUrl = audioData;
    if (audioData.includes('drive.google.com') && !audioData.includes('uc?')) {
      // Convertir URLs de vista a URLs de descarga directa
      const fileIdMatch = audioData.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch) {
        finalAudioUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
        console.log('🔄 URL convertida para descarga directa:', finalAudioUrl);
      }
    }
    
    // Crear elemento de audio dinámico
    const audioId = 'response_audio_' + Date.now();
    const audioContainer = document.createElement('div');
    audioContainer.className = 'audio-response-container';
    
    audioContainer.innerHTML = `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 15px; margin: 15px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
          <span style="font-size: 1.5em;">🔊</span>
          <strong style="font-size: 1.1em;">Respuesta de Audio desde N8N</strong>
        </div>
        <div id="status-${audioId}" style="color: #e8f5e8; font-size: 14px; margin-bottom: 10px;">🔄 Intentando cargar audio...</div>
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin: 10px 0;">
          <div style="font-size: 12px; color: #b8d4ff; margin-bottom: 8px;">URL del audio:</div>
          <div style="font-size: 11px; word-break: break-all; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px;">${finalAudioUrl}</div>
        </div>
        <audio id="audio-${audioId}" controls preload="auto" style="width: 100%; height: 50px; border-radius: 8px; background: rgba(255,255,255,0.1);" crossorigin="anonymous">
          <source src="${finalAudioUrl}" type="audio/mpeg">
          <source src="${finalAudioUrl}" type="audio/mp3">
          <source src="${finalAudioUrl}" type="audio/wav">
          <source src="${finalAudioUrl}" type="audio/ogg">
          Tu navegador no soporta la reproducción de audio.
        </audio>
        <div id="fallback-${audioId}" style="margin-top: 15px;">
          <button onclick="window.open('${finalAudioUrl}', '_blank')" style="background: #4CAF50; color: white; border: none; padding: 10px 16px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 14px;">
            📥 Descargar Audio Directo
          </button>
          <button onclick="tryDirectPlay('${audioId}', '${finalAudioUrl}')" style="background: #2196F3; color: white; border: none; padding: 10px 16px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 14px;">
            🔄 Reintentar Carga
          </button>
          <button onclick="testAudioUrl('${finalAudioUrl}')" style="background: #FF9800; color: white; border: none; padding: 10px 16px; border-radius: 5px; cursor: pointer; font-size: 14px;">
            🔍 Probar URL
          </button>
        </div>
        <div id="debug-${audioId}" style="font-size: 11px; color: #b8d4ff; margin-top: 10px; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
          🔍 Estado: Iniciando carga...
        </div>
      </div>
    `;

    // Agregar al chat
    chatLog.appendChild(audioContainer);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Configurar elemento de audio
    const audioElement = document.getElementById(`audio-${audioId}`);
    const statusElement = document.getElementById(`status-${audioId}`);
    const debugElement = document.getElementById(`debug-${audioId}`);
    
    if (!audioElement || !statusElement || !debugElement) {
      console.error('❌ No se pudieron crear los elementos de audio');
      return;
    }

    // Timeout más largo para Google Drive
    const loadTimeout = setTimeout(() => {
      console.log('⏰ Timeout de carga de audio alcanzado (Google Drive puede ser lento)');
      statusElement.textContent = '⚠️ Google Drive es lento - Usa descarga directa';
      statusElement.style.color = '#ffeb3b';
      debugElement.textContent = '⏰ Timeout: Google Drive bloquea carga directa en navegadores';
    }, 15000); // 15 segundos para Google Drive

    // Event listeners detallados
    audioElement.addEventListener('loadstart', () => {
      console.log('🔄 EVENTO: loadstart - Iniciando carga...');
      statusElement.textContent = '🔄 Conectando con Google Drive...';
      debugElement.textContent = '🔄 Evento: loadstart - Solicitando archivo a Google Drive';
    });

    audioElement.addEventListener('progress', (e) => {
      console.log('📊 EVENTO: progress - Descargando...');
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        statusElement.textContent = `📊 Descargando: ${percent}%`;
        debugElement.textContent = `📊 Progreso: ${e.loaded}/${e.total} bytes (${percent}%)`;
      } else {
        statusElement.textContent = '📊 Descargando datos...';
        debugElement.textContent = '📊 Descargando (tamaño desconocido)';
      }
    });

    audioElement.addEventListener('loadedmetadata', () => {
      console.log('📋 EVENTO: loadedmetadata - Metadatos cargados');
      statusElement.textContent = '📋 Metadatos cargados';
      debugElement.textContent = `📋 Duración: ${audioElement.duration}s, Puede reproducir: ${audioElement.readyState}`;
    });

    audioElement.addEventListener('loadeddata', () => {
      console.log('📊 EVENTO: loadeddata - Datos suficientes cargados');
      statusElement.textContent = '📊 Datos cargados - Intentando reproducir...';
      debugElement.textContent = '📊 Datos listos para reproducción';
      clearTimeout(loadTimeout);
      
      // Intentar reproducción automática
      setTimeout(() => {
        console.log('🎯 Intentando reproducción automática...');
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('🎵 ¡ÉXITO! Reproducción automática funcionando');
              statusElement.textContent = '🎵 ¡Reproduciendo automáticamente!';
              debugElement.textContent = '✅ Reproducción automática exitosa';
            })
            .catch(error => {
              console.log('⚠️ Autoplay bloqueado por navegador:', error.message);
              statusElement.textContent = '⚠️ Haz clic en ▶️ para reproducir';
              debugElement.textContent = `⚠️ Autoplay bloqueado: ${error.message}`;
            });
        }
      }, 800);
    });

    audioElement.addEventListener('canplay', () => {
      console.log('✅ EVENTO: canplay - Listo para reproducir');
      statusElement.textContent = '✅ Listo para reproducir';
      debugElement.textContent = '✅ Audio completamente listo';
      clearTimeout(loadTimeout);
    });

    audioElement.addEventListener('play', () => {
      console.log('▶️ EVENTO: play - Reproducción iniciada');
      statusElement.textContent = '▶️ Reproduciendo...';
      debugElement.textContent = '▶️ Reproducción en curso';
    });

    audioElement.addEventListener('pause', () => {
      console.log('⏸️ EVENTO: pause - Reproducción pausada');
      statusElement.textContent = '⏸️ Pausado';
      debugElement.textContent = '⏸️ Usuario pausó la reproducción';
    });

    audioElement.addEventListener('ended', () => {
      console.log('🏁 EVENTO: ended - Reproducción completada');
      statusElement.textContent = '🏁 Reproducción completada ✅';
      debugElement.textContent = '🏁 Audio terminado correctamente';
    });

    audioElement.addEventListener('error', (e) => {
      console.error('❌ EVENTO: error - Error crítico de audio');
      console.error('❌ Error object:', audioElement.error);
      console.error('❌ Event:', e);
      clearTimeout(loadTimeout);
      
      let errorMsg = 'Error desconocido';
      let debugMsg = 'Error sin detalles';
      
      if (audioElement.error) {
        switch(audioElement.error.code) {
          case 1: 
            errorMsg = 'Descarga abortada por usuario'; 
            debugMsg = 'MEDIA_ERR_ABORTED: Usuario canceló';
            break;
          case 2: 
            errorMsg = 'Error de red - Google Drive bloqueó acceso'; 
            debugMsg = 'MEDIA_ERR_NETWORK: Google Drive CORS/bloqueo';
            break;
          case 3: 
            errorMsg = 'Error de decodificación del audio'; 
            debugMsg = 'MEDIA_ERR_DECODE: Archivo corrupto o formato malo';
            break;
          case 4: 
            errorMsg = 'Formato de audio no soportado'; 
            debugMsg = 'MEDIA_ERR_SRC_NOT_SUPPORTED: Formato no compatible';
            break;
        }
      }
      
      statusElement.textContent = `❌ ${errorMsg}`;
      statusElement.style.color = '#ffcccb';
      debugElement.textContent = `❌ ${debugMsg}`;
      debugElement.style.color = '#ffcccb';
    });

    audioElement.addEventListener('stalled', () => {
      console.log('🐌 EVENTO: stalled - Descarga estancada');
      statusElement.textContent = '🐌 Conexión lenta...';
      debugElement.textContent = '🐌 Descarga estancada - Google Drive limitando velocidad';
    });

    audioElement.addEventListener('suspend', () => {
      console.log('⏸️ EVENTO: suspend - Descarga suspendida');
      debugElement.textContent = '⏸️ Navegador suspendió descarga para ahorrar ancho de banda';
    });

    // Forzar carga del audio
    console.log('🚀 Forzando carga del audio desde Google Drive...');
    debugElement.textContent = '🚀 Iniciando carga forzada...';
    audioElement.load();

  } catch (error) {
    console.error('❌ Error crítico en playAudioReliable:', error);
    appendMessage('Sistema', `❌ Error crítico al procesar audio: ${error.message}`);
  }
}

// Función auxiliar para reintentar reproducción
window.tryDirectPlay = function(audioId, url) {
  const audioElement = document.getElementById(`audio-${audioId}`);
  const statusElement = document.getElementById(`status-${audioId}`);
  const debugElement = document.getElementById(`debug-${audioId}`);
  
  if (audioElement && statusElement) {
    console.log('🔄 Reintentando carga manual de audio...');
    statusElement.textContent = '🔄 Reintentando carga...';
    debugElement.textContent = '🔄 Recargando archivo desde Google Drive...';
    
    audioElement.src = url;
    audioElement.load();
    
    setTimeout(() => {
      audioElement.play()
        .then(() => {
          console.log('✅ Reintento exitoso');
          statusElement.textContent = '✅ ¡Reintento exitoso!';
          debugElement.textContent = '✅ Carga manual funcionó';
        })
        .catch((error) => {
          console.log('❌ Reintento falló:', error.message);
          statusElement.textContent = '❌ Reintento fallido';
          debugElement.textContent = `❌ Reintento falló: ${error.message}`;
        });
    }, 1500);
  }
};

// Función para probar la URL directamente
window.testAudioUrl = function(url) {
  console.log('🔍 Probando URL de audio directamente:', url);
  
  // Crear ventana de prueba
  const testWindow = window.open('', '_blank', 'width=600,height=400');
  testWindow.document.write(`
    <html>
      <head><title>Prueba de Audio - Google Drive</title></head>
      <body style="font-family: Arial; padding: 20px; background: #f0f0f0;">
        <h2>🔍 Prueba de URL de Audio</h2>
        <p><strong>URL:</strong> <code style="word-break: break-all;">${url}</code></p>
        <p>🔄 <strong>Intentando cargar audio...</strong></p>
        <audio controls style="width: 100%; margin: 20px 0;" preload="auto">
          <source src="${url}" type="audio/mpeg">
          <source src="${url}" type="audio/mp3">
          <source src="${url}" type="audio/wav">
          Tu navegador no soporta este audio.
        </audio>
        <div id="status">⏳ Cargando...</div>
        <hr style="margin: 20px 0;">
        <h3>📊 Información de Debug:</h3>
        <div id="debug" style="background: #fff; padding: 10px; border-radius: 5px; font-size: 12px;"></div>
        <button onclick="window.close()" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-top: 20px; cursor: pointer;">Cerrar</button>
        
        <script>
          const audio = document.querySelector('audio');
          const status = document.getElementById('status');
          const debug = document.getElementById('debug');
          
          let debugInfo = [];
          
          function addDebug(msg) {
            debugInfo.push(new Date().toLocaleTimeString() + ': ' + msg);
            debug.innerHTML = debugInfo.join('<br>');
          }
          
          audio.addEventListener('loadstart', () => {
            status.textContent = '🔄 Iniciando carga...';
            addDebug('loadstart - Comenzando carga');
          });
          
          audio.addEventListener('loadeddata', () => {
            status.textContent = '✅ Audio cargado correctamente';
            addDebug('loadeddata - Audio listo para reproducir');
          });
          
          audio.addEventListener('error', (e) => {
            status.textContent = '❌ Error al cargar audio';
            addDebug('ERROR: ' + (audio.error ? audio.error.code + ' - ' + audio.error.message : 'Error desconocido'));
          });
          
          audio.addEventListener('play', () => {
            status.textContent = '▶️ Reproduciendo...';
            addDebug('play - Reproducción iniciada');
          });
          
          audio.addEventListener('ended', () => {
            status.textContent = '🏁 Reproducción completada';
            addDebug('ended - Audio terminado');
          });
          
          addDebug('Iniciando prueba de URL de Google Drive');
        </script>
      </body>
    </html>
  `);
};

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
        playAudioReliable(audioUrl);
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

// Función eliminada - ahora usamos solo playAudioReliable()

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