const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const configContainer = document.getElementById('config-container');
const fotosContainer = document.getElementById('fotos-container');

const N8N_API_URL = "https://mauriciomeseguer.up.railway.app/webhook/bf351844-0718-4d84-bd9c-e5fbea35a83b";

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  appendMessage('Tú', message);
  chatInput.value = '';

  // Mostrar spinner de carga
  showLoadingSpinner();

  try {
    console.log('Enviando mensaje a N8N:', message);
    
    const response = await fetch(N8N_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: message })
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

    // Si responde con 'respuesta' para mostrar mensaje de chat del agente
    if (data.respuesta) {
      appendMessage('Agente', data.respuesta);
    }

    // Si responde con ambos o ninguno, controla ambos casos
    if (!data.respuesta && !data.configuracion_final) {
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
