const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const configContainer = document.getElementById('config-container');
const fotosContainer = document.getElementById('fotos-container');

// Puedes poner aquí la URL de tu webhook cuando lo tengas
// const N8N_API_URL = "https://TU_WEBHOOK_DE_N8N";

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  appendMessage('Tú', message);
  chatInput.value = '';

  // Simula la respuesta del agente (después lo cambias por fetch a n8n)
  setTimeout(() => {
    if (message.toLowerCase().includes('final')) {
      // Simula la configuración final
      renderConfiguracion({
        componentes: [
          {
            nombre: 'Procesador',
            descripcion: 'AMD Ryzen 5 5600X, 6 núcleos, 12 hilos, hasta 4.6 GHz',
            imagen: 'https://m.media-amazon.com/images/I/61TPRRqyxCL._AC_SL1500_.jpg'
          },
          {
            nombre: 'Tarjeta Gráfica',
            descripcion: 'NVIDIA RTX 4060 8GB GDDR6',
            imagen: 'https://m.media-amazon.com/images/I/81SkV7y3xGL._AC_SL1500_.jpg'
          },
          {
            nombre: 'Memoria RAM',
            descripcion: '16GB DDR4 3200MHz (2x8GB)',
            imagen: 'https://m.media-amazon.com/images/I/71RWp6MNZ2L._AC_SL1500_.jpg'
          }
        ]
      });
    } else {
      appendMessage('Agente', '¡Mensaje recibido! Dime tu presupuesto o necesidades y cuando estés listo escribe "final" para ver una configuración de ejemplo.');
    }
  }, 900);

  // Si quieres conectar con n8n:
  /*
  const response = await fetch(N8N_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensaje: message })
  });
  const data = await response.json();
  if (data.configuracion_final) {
    renderConfiguracion(data.configuracion_final);
  } else {
    appendMessage('Agente', data.respuesta || '...');
  }
  */
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
