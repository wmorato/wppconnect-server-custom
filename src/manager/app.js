const API_URL = 'http://localhost:21465';
const SECRET_KEY = 'minhasenha';

let activeSessionInterval = null;
let countdownInterval = null;

// --- LÓGICA DO MODAL E MENUS ---

function openModal(title, content) {
  document.getElementById('modal-title').innerHTML = title;
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-backdrop').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-backdrop').style.display = 'none';
  if (activeSessionInterval) {
    clearInterval(activeSessionInterval);
    activeSessionInterval = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function openCreateSessionModal() {
  const modalContent = `<input type="text" id="new-session-name" placeholder="Nome da Sessão"><br><br><input type="text" id="new-session-webhook" placeholder="URL do Webhook (opcional)"><div class="modal-actions"><button onclick="criarSessao(null)">Criar e Iniciar</button></div>`;
  openModal('Criar Nova Sessão', modalContent);
}

function toggleActionMenu(sessionName) {
  const menu = document.getElementById(`menu-${sessionName}`);
  const card = document.getElementById(`card-${sessionName}`);
  const isOpening = menu.style.display !== 'block';

  // Primeiro, fecha todos os menus e remove a classe ativa de todos os cards
  document
    .querySelectorAll('.action-menu')
    .forEach((m) => (m.style.display = 'none'));
  document
    .querySelectorAll('.session-card')
    .forEach((c) => c.classList.remove('menu-active'));

  // Se o menu estava fechado, agora o abre e ativa o card
  if (isOpening && menu && card) {
    menu.style.display = 'block';
    card.classList.add('menu-active');
  }
}

// --- LÓGICA DE AUTENTICAÇÃO ---
async function getTokenForSession(sessionName) {
  try {
    const response = await fetch(
      `${API_URL}/api/${sessionName}/${SECRET_KEY}/generate-token`,
      { method: 'POST' }
    );
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error(`Falha ao gerar token para ${sessionName}:`, error);
    throw error;
  }
}

// --- CONEXÃO WEBSOCKET ---
const socket = io(API_URL);
socket.on('status-session', (data) => {
  if (data.status === 'inChat' || data.status === 'isLogged') {
    closeModal();
    carregarSessoes();
  }
});

// --- FUNÇÕES DA API ---

async function carregarSessoes() {
  const loadingMessage = document.getElementById('loading-message');
  const sessionsContainer = document.getElementById('lista-sessoes');
  sessionsContainer.innerHTML = '';
  loadingMessage.style.display = 'block';

  try {
    const responseList = await fetch(
      `${API_URL}/api/${SECRET_KEY}/show-all-sessions`
    );
    const data = await responseList.json();
    const sessionNames = data.response;

    if (!sessionNames || sessionNames.length === 0) {
      sessionsContainer.innerHTML =
        '<p style="text-align: center; color: #667781;">Nenhuma sessão encontrada.</p>';
    } else {
      for (const sessionName of sessionNames) {
        let status = 'desconhecido';
        let statusClass = 'disconnected';
        try {
          const token = await getTokenForSession(sessionName);
          const statusResponse = await fetch(
            `${API_URL}/api/${sessionName}/status-session`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            status = statusData.status;
            if (status === 'isLogged' || status === 'inChat') {
              statusClass = 'connected';
            }
          }
        } catch (e) {
          /* ignore */
        }

        const card = document.createElement('div');
        card.className = 'session-card';
        card.id = `card-${sessionName}`;
        card.innerHTML = `
            <div class="session-avatar">${sessionName.substring(0, 2)}</div>
            <div class="session-info">
                <p class="name">${sessionName}</p>
                <p class="status ${statusClass}">${status}</p>
            </div>
            <div class="session-actions">
                <button class="menu-button" onclick="event.stopPropagation(); toggleActionMenu('${sessionName}')">
                    <i class="fa fa-ellipsis-v"></i>
                </button>
                <div class="action-menu" id="menu-${sessionName}" onclick="event.stopPropagation()">
                    <a onclick="showQrCode('${sessionName}')">Ver QR Code</a>
                    <a onclick="criarSessao('${sessionName}')">Reiniciar</a>
                    <a onclick="closeSession('${sessionName}')">Fechar Conexão</a>
                    <a onclick="logoutSession('${sessionName}')">Logout</a>
                    <hr style="margin: 4px 10px; border-color: #f0f0f04d;">
                    <a class="delete-action" onclick="deleteSessionPermanently('${sessionName}')">Deletar do Servidor</a>
                </div>
            </div>
        `;
        sessionsContainer.appendChild(card);
      }
    }
    loadingMessage.style.display = 'none';
  } catch (error) {
    loadingMessage.innerText = `Erro: ${error.message}`;
  }
}

async function criarSessao(sessionNameToCreate) {
  const sessionName =
    sessionNameToCreate || document.getElementById('new-session-name')?.value;
  const webhookUrl =
    document.getElementById('new-session-webhook')?.value || '';
  if (!sessionName) {
    alert('Digite um nome para a sessão.');
    return;
  }
  if (webhookUrl) {
    try {
      new URL(webhookUrl);
    } catch (error) {
      alert('URL do Webhook inválida.');
      return;
    }
  }
  closeModal();
  openModal(
    'Conectar Sessão',
    `<p>Iniciando sessão <strong>${sessionName}</strong>...</p><div id="qrcode-image-container"><div class="loader"></div></div>`
  );
  try {
    const requestBody = { webhook: webhookUrl, waitQrCode: false };
    const startToken = await getTokenForSession(sessionName);
    await fetch(`${API_URL}/api/${sessionName}/start-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${startToken}`,
      },
      body: JSON.stringify(requestBody),
    });
    let attempts = 0;
    const maxAttempts = 30;
    activeSessionInterval = setInterval(async () => {
      if (attempts >= maxAttempts) {
        clearInterval(activeSessionInterval);
        document.getElementById(
          'qrcode-image-container'
        ).innerHTML = `<p style="color: red;">Tempo esgotado.</p><div class="modal-actions"><button onclick="criarSessao('${sessionName}')">Renovar QR Code</button></div>`;
        return;
      }
      try {
        const statusToken = await getTokenForSession(sessionName);
        const statusResponse = await fetch(
          `${API_URL}/api/${sessionName}/status-session`,
          { headers: { Authorization: `Bearer ${statusToken}` } }
        );
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          if (statusData.status === 'QRCODE') {
            clearInterval(activeSessionInterval);
            const qrToken = await getTokenForSession(sessionName);
            const qrResponse = await fetch(
              `${API_URL}/api/${sessionName}/qrcode-session`,
              { headers: { Authorization: `Bearer ${qrToken}` } }
            );
            const imageBlob = await qrResponse.blob();
            const imageUrl = URL.createObjectURL(imageBlob);
            document.getElementById(
              'qrcode-image-container'
            ).innerHTML = `<img src="${imageUrl}" alt="QR Code"><p id="countdown">Aguardando leitura...</p>`;
            let timeLeft = 60;
            document.getElementById(
              'countdown'
            ).innerText = `Expira em: ${timeLeft}s`;
            countdownInterval = setInterval(() => {
              timeLeft--;
              document.getElementById(
                'countdown'
              ).innerText = `Expira em: ${timeLeft}s`;
              if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                document.getElementById(
                  'qrcode-image-container'
                ).innerHTML = `<p style="color: red;">QR Code expirado.</p><div class="modal-actions"><button onclick="criarSessao('${sessionName}')">Renovar QR Code</button></div>`;
              }
            }, 1000);
          }
        }
      } catch (e) {
        console.error('Erro ao verificar status:', e);
      }
      attempts++;
    }, 2000);
  } catch (error) {
    alert(`Erro ao criar sessão: ${error.message}`);
    closeModal();
  }
}

// --- FUNÇÕES DE AÇÃO ---

async function showQrCode(sessionName) {
  closeModal();
  openModal(
    'QR Code: ' + sessionName,
    `<div id="qrcode-image-container"><div class="loader"></div></div>`
  );
  try {
    const token = await getTokenForSession(sessionName);
    const response = await fetch(
      `${API_URL}/api/${sessionName}/qrcode-session`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.ok) {
      const imageBlob = await response.blob();
      if (imageBlob.size > 0) {
        const imageUrl = URL.createObjectURL(imageBlob);
        document.getElementById(
          'qrcode-image-container'
        ).innerHTML = `<img src="${imageUrl}" alt="QR Code">`;
      } else {
        document.getElementById(
          'qrcode-image-container'
        ).innerHTML = `<p>Não há QR Code para esta sessão. Ela pode já estar conectada ou fechada.</p>`;
      }
    } else {
      throw new Error('Falha ao buscar QR Code.');
    }
  } catch (error) {
    document.getElementById(
      'qrcode-image-container'
    ).innerHTML = `<p style="color:red;">${error.message}</p>`;
  }
}

async function closeSession(sessionName) {
  if (
    !confirm(
      `Tem certeza que deseja fechar a conexão da sessão "${sessionName}"?`
    )
  )
    return;
  try {
    const token = await getTokenForSession(sessionName);
    await fetch(`${API_URL}/api/${sessionName}/close-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    alert('Sessão fechada com sucesso.');
    carregarSessoes();
  } catch (error) {
    alert(`Erro ao fechar sessão: ${error.message}`);
  }
}

async function logoutSession(sessionName) {
  if (
    !confirm(`Tem certeza que deseja fazer LOGOUT da sessão "${sessionName}"?`)
  )
    return;
  try {
    const token = await getTokenForSession(sessionName);
    const response = await fetch(
      `${API_URL}/api/${sessionName}/logout-session`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const result = await response.json();
    if (response.ok) {
      alert('Logout da sessão realizado com sucesso.');
      carregarSessoes();
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    alert(`Erro ao fazer logout: ${error.message}`);
  }
}

async function deleteSessionPermanently(sessionName) {
  const confirmation = confirm(
    `ATENÇÃO: Isso irá apagar PERMANENTEMENTE todos os dados da sessão "${sessionName}" do servidor.\n\nVocê tem certeza?`
  );

  if (confirmation) {
    try {
      // ADICIONADO: Gera o token antes de fazer a chamada
      const token = await getTokenForSession(sessionName);

      const response = await fetch(
        `${API_URL}/api/${sessionName}/clear-session`,
        {
          method: 'POST',
          // ADICIONADO: Envia o token no cabeçalho
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.status === true) {
        alert(`Sucesso: ${result.message}`);
        const cardToRemove = document.getElementById(`card-${sessionName}`);
        if (cardToRemove) {
          cardToRemove.remove();
        }
      } else {
        throw new Error(result.message || 'Falha ao limpar a sessão.');
      }
    } catch (error) {
      alert(`Erro ao deletar sessão: ${error.message}`);
    }
  }
}

// Ponto de entrada
document.addEventListener('DOMContentLoaded', () => {
  carregarSessoes();
  // Adiciona um listener para fechar TODOS os menus ao clicar fora
  document.addEventListener('click', (e) => {
    // Se o clique não foi em um botão de menu, fecha tudo
    if (!e.target.closest('.menu-button')) {
      document
        .querySelectorAll('.action-menu')
        .forEach((menu) => (menu.style.display = 'none'));
      document
        .querySelectorAll('.session-card')
        .forEach((c) => c.classList.remove('menu-active'));
    }
  });
});
