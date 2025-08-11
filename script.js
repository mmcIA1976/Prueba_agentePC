// ---- VARIABLES GLOBALES ----
let currentUser = null;
let chatId = null;
let recognition = null;
let isRecording = false;
let loadingSpinnerElement = null;
let lastMicClickTime = 0;
let micButtonDebouncing = false;

// Sistema de audio de "pensando"
let thinkingTimeouts = [];
let thinkingStartTime = null;
const THINKING_AUDIO_URL = "https://icobjdsqjjkumxsrlflf.supabase.co/storage/v1/object/public/conversacionesagente/ElevenLabs_2025-08-11T17_13_57_Sara%20Martin%203_pvc_sp113_s50_sb50_se12_b_m2.mp3";
const THINKING_AUDIO_URL_2 = "https://icobjdsqjjkumxsrlflf.supabase.co/storage/v1/object/public/conversacionesagente/ElevenLabs_2025-08-11T17_58_59_Sara%20Martin.mp3";
const THINKING_INTERVALS = [15000, 40000, 80000, 110000]; // 15s, 40s, 1m20s, 1m50s

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

    recognition.continuous = true; // Mantener la escucha activa
    recognition.interimResults = true; // Permitir resultados intermedios
    recognition.lang = 'es-ES'; // Idioma español
    recognition.maxAlternatives = 1; // Solo una alternativa

    // Configurar la sensibilidad al silencio
    recognition.onstart = () => {
      console.log('🎤 Reconocimiento de voz iniciado');
      isRecording = true;
      updateMicButton();
      appendMessage('Sistema', '🎤 Escuchando... Habla ahora');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript.trim()) {
        console.log('📝 Transcripción final:', finalTranscript);
        appendMessage('Tú', finalTranscript.trim());
        saveMessageToDB('Tú', finalTranscript.trim());
        sendMessage(finalTranscript.trim());
      } else if (interimTranscript.trim()) {
        // Opcional: mostrar transcripción intermedia si se desea
        // console.log('📝 Transcripción intermedia:', interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('❌ Error en reconocimiento de voz:', event.error);
      isRecording = false;
      updateMicButton();

      let errorMsg = 'Error en el reconocimiento de voz';
      switch(event.error) {
        case 'no-speech':
          errorMsg = 'No se detectó voz. Intenta hablar más claro o más cerca del micrófono.';
          appendMessage('Sistema', `❌ ${errorMsg}`);
          break;
        case 'audio-capture':
          errorMsg = 'No se pudo acceder al micrófono. Verifica que esté conectado y no esté en uso por otra aplicación.';
          appendMessage('Sistema', `❌ ${errorMsg}`);
          break;
        case 'not-allowed':
          errorMsg = 'Permisos de micrófono denegados. Por favor, habilita el acceso al micrófono en la configuración de tu navegador.';
          appendMessage('Sistema', `❌ ${errorMsg}`);
          break;
        case 'language-not-supported':
          errorMsg = 'El idioma configurado no es compatible. Se usará un idioma predeterminado.';
          appendMessage('Sistema', `❌ ${errorMsg}`);
          break;
        default:
          errorMsg = `Error desconocido: ${event.error}`;
          appendMessage('Sistema', `❌ ${errorMsg}`);
          break;
      }
    };

    recognition.onend = () => {
      console.log('⏹️ Reconocimiento de voz terminado');
      isRecording = false;
      updateMicButton();
      // Solo mostrar este mensaje si no se detuvo por falta de voz
      if (!event || event.error !== 'no-speech') {
         appendMessage('Sistema', '⏹️ Reconocimiento de voz detenido');
      }
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
    micButton.style.backgroundColor = '#ff4757'; // Rojo
  } else {
    micButton.textContent = '🎤';
    micButton.classList.remove('recording');
    micButton.title = 'Iniciar conversación';
    micButton.style.backgroundColor = '#2ed573'; // Verde
  }
}

function toggleRecording() {
  // Protección anti-spam: debouncing robusto
  const now = Date.now();
  const DEBOUNCE_TIME = 500; // Reducido a 500ms para mejor experiencia

  if (micButtonDebouncing) {
    console.log('⚠️ Botón micrófono en debounce, ignorando click');
    return;
  }

  if (now - lastMicClickTime < DEBOUNCE_TIME) {
    console.log('⚠️ Click muy rápido en micrófono, ignorando');
    return;
  }

  lastMicClickTime = now;
  micButtonDebouncing = true;

  // Deshabilitar botón temporalmente
  const micButton = document.getElementById('mic-button');
  if (micButton) {
    micButton.disabled = true;
    micButton.style.opacity = '0.7';
  }

  // Reactivar después del debounce
  setTimeout(() => {
    micButtonDebouncing = false;
    if (micButton) {
      micButton.disabled = false;
      micButton.style.opacity = '1';
    }
  }, DEBOUNCE_TIME);

  if (!recognition) {
    console.log('❌ Reconocimiento de voz no disponible');
    appendMessage('Sistema', '❌ Función de voz no disponible en este navegador');
    return;
  }

  if (!isRecording) {
    console.log('🎤 Iniciando grabación con auto-stop...');
    try {
      // Configuración para auto-stop por silencio
      recognition.continuous = false; // Detenerse después de la primera frase final o silencio
      recognition.interimResults = false; // No necesitamos resultados intermedios para auto-stop

      recognition.start();
    } catch (error) {
      console.error('Error al iniciar reconocimiento:', error);
      appendMessage('Sistema', '❌ No se pudo iniciar el reconocimiento de voz');
    }
  } else {
    console.log('⏹️ Deteniendo grabación manualmente...');
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

    console.log('🔍 Datos recibidos de N8N:', _out);

    // Mostrar configuración si existe
    if (_out && _out.config_final && Array.isArray(_out.config_final) && _out.config_final.length > 0) {
      console.log('✅ Renderizando configuración final:', _out.config_final);
      renderConfiguracion(_out.config_final);
      
      // Reproducir audio fijo de configuración final
      console.log('🎵 Reproduciendo audio específico para configuración final...');
      playConfiguracionFinalAudio();
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

    // Manejar audio desde Supabase
    if (_out && _out.audio_url && typeof _out.audio_url === "string" && _out.audio_url.trim()) {
      console.log('🎵 ✅ Audio URL encontrada:', _out.audio_url);
      playSupabaseAudio(_out.audio_url);
    }

    if (!textoMostrado && (!_out.config_final || (_out.config_final && Array.isArray(_out.config_final) && _out.config_final.length === 0)) && !_out.audio_url) {
      console.log('❌ No se encontró contenido válido en respuesta');
      console.log('🔍 Campos disponibles:', Object.keys(_out || {}));
      appendMessage('Agente', 'No se recibió respuesta del agente.');
    }

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
    
    appendMinimalAudioMessage(audioUrl, 'Audio de Respuesta', true);
    
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

// --- REPRODUCTOR MINIMALISTA ---
function appendMinimalAudioMessage(audioUrl, title = 'Audio', isBinary = false) {
  const audioId = 'mini_audio_' + Date.now();
  const div = document.createElement('div');
  
  div.className = 'chat-message agent audio-message';
  div.innerHTML = `
    <img class="avatar" src="https://api.dicebear.com/7.x/bottts/svg?seed=robot" alt="IA">
    <div class="minimal-audio-player">
      <div class="audio-info">
        <span class="audio-icon">🎵</span>
        <span class="audio-title">${title}</span>
      </div>
      <div class="audio-controls-mini">
        <button class="play-pause-btn" onclick="toggleAudioPlayback('${audioId}')" id="btn-${audioId}">
          ▶️
        </button>
        <div class="audio-progress">
          <div class="progress-bar" id="progress-${audioId}"></div>
        </div>
        <span class="audio-time" id="time-${audioId}">0:00</span>
      </div>
      <audio id="${audioId}" preload="auto" style="display: none;">
        <source src="${audioUrl}" type="audio/mpeg">
      </audio>
    </div>
  `;
  
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  
  setupMiniAudioPlayer(audioId);
}

function setupMiniAudioPlayer(audioId) {
  const audioElement = document.getElementById(audioId);
  const playBtn = document.getElementById(`btn-${audioId}`);
  const progressBar = document.getElementById(`progress-${audioId}`);
  const timeDisplay = document.getElementById(`time-${audioId}`);
  
  if (!audioElement || !playBtn || !progressBar || !timeDisplay) return;
  
  // Auto-reproducir cuando esté listo
  audioElement.addEventListener('loadeddata', () => {
    console.log('✅ Audio minimalista cargado y listo');
    setTimeout(() => {
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('🎵 Audio reproduciéndose automáticamente');
            playBtn.textContent = '⏸️';
          })
          .catch(() => {
            console.log('⚠️ Autoplay bloqueado');
          });
      }
    }, 500);
  });
  
  // Actualizar progreso
  audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) {
      const progress = (audioElement.currentTime / audioElement.duration) * 100;
      progressBar.style.width = progress + '%';
      
      const minutes = Math.floor(audioElement.currentTime / 60);
      const seconds = Math.floor(audioElement.currentTime % 60);
      timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  });
  
  // Cuando termine
  audioElement.addEventListener('ended', () => {
    playBtn.textContent = '▶️';
    progressBar.style.width = '0%';
    timeDisplay.textContent = '0:00';
  });
  
  // Error
  audioElement.addEventListener('error', () => {
    playBtn.textContent = '❌';
    timeDisplay.textContent = 'Error';
  });
}

// Función global para controlar reproducción
window.toggleAudioPlayback = function(audioId) {
  const audioElement = document.getElementById(audioId);
  const playBtn = document.getElementById(`btn-${audioId}`);
  
  if (!audioElement || !playBtn) return;
  
  if (audioElement.paused) {
    audioElement.play();
    playBtn.textContent = '⏸️';
  } else {
    audioElement.pause();
    playBtn.textContent = '▶️';
  }
};

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
  
  // Iniciar sistema de audio de pensando
  startThinkingAudioSystem();
}

// --- SISTEMA DE AUDIO DE PENSANDO ---
function startThinkingAudioSystem() {
  console.log('🧠 Iniciando sistema de audio de pensando...');
  thinkingStartTime = Date.now();
  clearThinkingTimeouts();
  
  // Programar audios en intervalos: 15s, 40s, 1m20s
  THINKING_INTERVALS.forEach((interval, index) => {
    const timeout = setTimeout(() => {
      console.log(`🧠 Reproduciendo audio de pensando (intervalo ${index + 1}: ${interval/1000}s)`);
      playThinkingAudio(index + 1);
    }, interval);
    
    thinkingTimeouts.push(timeout);
  });
}

function clearThinkingTimeouts() {
  thinkingTimeouts.forEach(timeout => clearTimeout(timeout));
  thinkingTimeouts = [];
}

function playThinkingAudio(iteration) {
  try {
    console.log(`🧠 Reproduciendo audio de pensando (${iteration})`);
    
    // Mostrar mensaje contextual según la iteración
    let message = '';
    let audioUrl = THINKING_AUDIO_URL; // Por defecto usar el primer audio
    
    switch(iteration) {
      case 1:
        message = 'El agente está procesando la información... En unos minutos tendrás tu configuración';
        break;
      case 2:
        message = 'Analizando componentes y precios actualizados... Un poco más de paciencia';
        break;
      case 3:
        message = 'Últimos ajustes para optimizar tu configuración... Ya casi está listo';
        break;
      case 4:
        message = 'Finalizando los últimos detalles de tu configuración ideal... Solo unos segundos más';
        audioUrl = THINKING_AUDIO_URL_2; // Usar el segundo audio para el 4to intervalo
        break;
      default:
        message = 'El agente sigue trabajando en tu configuración perfecta...';
    }
    
    appendMessage('Sistema', `🧠 ${message}`);
    appendMinimalAudioMessage(audioUrl, `Audio de Pensando ${iteration}`);
    
  } catch (error) {
    console.error('❌ Error reproduciendo audio de pensando:', error);
  }
}

function hideLoadingSpinner() {
  if (loadingSpinnerElement) {
    chatLog.removeChild(loadingSpinnerElement);
    loadingSpinnerElement = null;
  }
  
  // Detener sistema de audio de pensando
  stopThinkingAudioSystem();
}

function stopThinkingAudioSystem() {
  console.log('🧠 Deteniendo sistema de audio de pensando');
  clearThinkingTimeouts();
  
  if (thinkingStartTime) {
    const thinkingDuration = (Date.now() - thinkingStartTime) / 1000;
    console.log(`🧠 El agente estuvo pensando ${thinkingDuration.toFixed(1)} segundos`);
    thinkingStartTime = null;
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

// --- AUDIO FIJO CONFIGURACIÓN FINAL ---
function playConfiguracionFinalAudio() {
  // URL fija del audio de configuración final
  const CONFIGURACION_FINAL_AUDIO_URL = "https://icobjdsqjjkumxsrlflf.supabase.co/storage/v1/object/public/conversacionesagente/2025-08-11T15:57:06.296+02:00.mp3";
  
  try {
    console.log('🎵 Reproduciendo audio fijo de configuración final');
    appendMinimalAudioMessage(CONFIGURACION_FINAL_AUDIO_URL, 'Configuración Final - Audio');
  } catch (error) {
    console.error('❌ Error procesando audio de configuración final:', error);
    appendMessage('Sistema', `❌ Error al procesar audio: ${error.message}`);
  }
}

// --- AUDIO DESDE SUPABASE ---
function playSupabaseAudio(audioUrl) {
  try {
    console.log('🎵 Reproduciendo audio desde Supabase:', audioUrl);
    appendMinimalAudioMessage(audioUrl, 'Audio del Agente');
  } catch (error) {
    console.error('❌ Error procesando audio de Supabase:', error);
    appendMessage('Sistema', `❌ Error al procesar audio: ${error.message}`);
  }
}

// --- FUNCIONES GLOBALES ---
window.downloadSupabaseAudio = function(audioUrl) {
  const a = document.createElement('a');
  a.href = audioUrl;
  a.download = `audio_agente_${Date.now()}.mp3`;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

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