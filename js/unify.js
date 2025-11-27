

(function(){
  'use strict';

  const STORAGE_KEY = 'unify_conversations';

  function loadConversations() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveConversations(convos) { localStorage.setItem(STORAGE_KEY, JSON.stringify(convos)); }

  function createConversation() {
    const convos = loadConversations();
    const id = Date.now().toString();
    const conv = { id, createdAt: new Date().toISOString(), messages: [], status: 'open' };
    convos.push(conv); saveConversations(convos); return conv;
  }

  function addMessage(conversationId, sender, text) {
    const convos = loadConversations();
    const conv = convos.find(c => c.id === conversationId); if (!conv) return null;
    const msg = { sender, text, timestamp: new Date().toISOString() };
    conv.messages.push(msg); saveConversations(convos); return msg;
  }

  function updateConversationStatus(conversationId, status) {
    const convos = loadConversations();
    const conv = convos.find(c => c.id === conversationId); if (!conv) return;
    conv.status = status; saveConversations(convos); return conv;
  }

  function getLastConversation() {
    const convos = loadConversations(); if (convos.length === 0) return null; return convos[convos.length - 1];
  }

  function autoReplyText(userText) {
    const s = userText.toLowerCase();
    if (s.includes('horário') || s.includes('horario') || s.includes('horários')) return 'Nosso horário de atendimento é de segunda a sexta, das 09:00 às 18:00.';
    if (s.includes('preço') || s.includes('valor') || s.includes('custo')) return 'Temos vários planos. Quer saber sobre planos disponíveis? Posso encaminhar para o setor responsável.';
    if (s.includes('obrig') || s.includes('obrigado')) return 'De nada! Fico feliz em ajudar. Posso ajudar em mais alguma coisa?';
    return 'Obrigado pela mensagem! Em instantes um atendente humano irá te auxiliar. Enquanto isso, posso ajudar com algo rápido?';
  }

  // Simulation logic (top-level): inject user messages periodically when enabled
  const simulationTimers = {};
  const sampleClientMessages = [
    'Estou com um problema na minha conta.',
    'quero saber mais informaçao?',
    'tenho duvidas do meu projeto.',
    'Posso falar com um atendente?',
    'que horarios tem.'
  ];

  function startSimulation(conversationId) {
    stopSimulation(conversationId);
    simulationTimers[conversationId] = setInterval(() => {
      const text = sampleClientMessages[Math.floor(Math.random() * sampleClientMessages.length)];
      addMessage(conversationId, 'user', text);
      // If any handler page is open, it can call renderMessages to update (but we can call window.unify functions if available)
      window.dispatchEvent(new CustomEvent('unify:new_message', { detail: { conversationId } }));
    }, 5000 + Math.floor(Math.random() * 8000));
  }

  function stopSimulation(conversationId) {
    if (simulationTimers[conversationId]) { clearInterval(simulationTimers[conversationId]); delete simulationTimers[conversationId]; }
  }

  /* -- Atendimento chat initializer -- */
  function initAtendimentoChat() {
    const openBtn = document.getElementById('openChatBtn');
    if (!openBtn) return; // not on this page

    const chatModal = document.getElementById('chatModal');
    const closeBtn = document.getElementById('closeChatBtn');
    const sendBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    const historyBtn = document.getElementById('openHistoryFromChat');
    const transferBtnEl = document.getElementById('transferBtn');
    const simulateClientBtn = document.getElementById('simulateClientBtn');
    const attendantModeToggle = document.getElementById('attendantModeToggle');
    const statusBadge = document.getElementById('chatStatusBadge');
    const chatBody = document.getElementById('chatBody');
    const chatDecision = document.getElementById('chatDecision');
    const chatContinueBtn = document.getElementById('chatContinueBtn');
    const chatNewBtn = document.getElementById('chatNewBtn');
    const chatWaitingBanner = document.getElementById('chatWaitingBanner');
    const closeChatX = document.getElementById('closeChatX');

    function updateChatStatusBadge(conversationId) {
      if (!statusBadge) return; const convs = loadConversations();
      const conv = convs.find(c => c.id === conversationId) || getLastConversation();
      if (!conv) { statusBadge.innerText = '—'; statusBadge.style.background='rgba(255,255,255,0.12)'; return; }
      if (conv.status === 'waiting') { statusBadge.innerText = 'Pendente'; statusBadge.style.background='rgba(255,193,7,0.12)'; }
      else if (conv.status === 'closed') { statusBadge.innerText = 'Fechado'; statusBadge.style.background='rgba(40,167,69,0.12)'; }
      else { statusBadge.innerText = 'Aberto'; statusBadge.style.background='rgba(255,255,255,0.15)'; }
    }

    function formatTimestamp(iso) { const d = new Date(iso); return d.toLocaleString(); }

    function showTyping() {
      if (!chatBody) return; let t = document.getElementById('typingIndicator'); if (t) return;
      // construct a message-like typing indicator bubble
      t = document.createElement('div'); t.id = 'typingIndicator'; t.className = 'msg bot typing';
      const avatar = document.createElement('div'); avatar.className = 'avatar bot'; avatar.innerText = 'B';
      const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
      const indicator = document.createElement('div'); indicator.className = 'typing-indicator'; indicator.innerHTML = '<span></span><span></span><span></span>';
      bubble.appendChild(indicator);
      t.appendChild(avatar); t.appendChild(bubble);
      chatBody.appendChild(t); setTimeout(() => { t.classList.add('show'); }, 10); chatBody.scrollTop = chatBody.scrollHeight;
    }
    function hideTyping() { const t = document.getElementById('typingIndicator'); if (t && t.parentNode) t.parentNode.removeChild(t); }

    function updateWaitingBanner(conversationId) {
      if (!chatWaitingBanner) return; const convs = loadConversations(); const conv = convs.find(c => c.id === conversationId) || getLastConversation(); if (!conv) { chatWaitingBanner.style.display = 'none'; return; } if (conv.status === 'waiting') { chatWaitingBanner.style.display = 'block'; } else { chatWaitingBanner.style.display = 'none'; } }

    function renderMessages(conversationId) {
      if (!chatBody) return; chatBody.innerHTML = '';
      const convos = loadConversations(); const conv = convos.find(c => c.id === conversationId); if (!conv) return;
      if (!conv.messages || conv.messages.length === 0) {
        const empty = document.createElement('div'); empty.className = 'empty'; empty.style.textAlign = 'center'; empty.style.color = '#666'; empty.style.padding = '20px'; empty.innerText = 'Nenhuma mensagem ainda. Envie uma mensagem para iniciar.';
        chatBody.appendChild(empty);
      }
      conv.messages.forEach(m => {
        const msg = document.createElement('div');
        msg.className = 'msg ' + (m.sender === 'user' ? 'user' : (m.sender === 'attendant' ? 'attendant' : 'bot'));

        const avatar = document.createElement('div'); avatar.className = 'avatar ' + (m.sender === 'user' ? 'user' : (m.sender === 'attendant' ? 'attendant' : 'bot'));
        avatar.innerText = (m.sender === 'user') ? 'U' : (m.sender === 'attendant' ? 'AT' : 'B');

        const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
        const textEl = document.createElement('div'); textEl.className = 'msg-text'; textEl.innerText = m.text;
        const meta = document.createElement('div'); meta.className = 'meta';
        const timeEl = document.createElement('span'); timeEl.className = 'msg-time'; timeEl.innerText = formatTimestamp(m.timestamp);
        meta.appendChild(timeEl);
        bubble.appendChild(textEl); bubble.appendChild(meta);

        if (m.sender === 'user') {
          // right aligned: bubble then avatar
          msg.appendChild(bubble); msg.appendChild(avatar);
        } else {
          // left aligned: avatar then bubble
          msg.appendChild(avatar); msg.appendChild(bubble);
        }

        chatBody.appendChild(msg);
        // animate appearing message
        setTimeout(() => { msg.classList.add('show'); }, 20);
      });
      // smooth scroll to bottom
      try {
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
      } catch (e) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }
      updateWaitingBanner(conversationId);
    }

    

    function openConversationById(id) {
      const convs = loadConversations(); const match = convs.find(c => c.id === id); if (!match) return null; return match; }

    let activeConversationId = null;
   
    (function checkOpenConvParam(){ try {
      const params = new URLSearchParams(window.location.search); const openConv = params.get('openConv'); if (!openConv) return; const match = openConversationById(openConv); if (match) { activeConversationId = match.id; chatModal.style.display = 'flex'; renderMessages(activeConversationId); updateChatStatusBadge(activeConversationId); chatInput.focus(); history.replaceState(null, '', window.location.pathname); } } catch(e) { console.warn('openConv param check failed', e); } })();

    openBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const last = getLastConversation();
      if (last && last.status !== 'closed') {
        chatModal.style.display = 'flex';
        if (chatDecision) chatDecision.style.display = 'block';
        if (chatWaitingBanner) updateWaitingBanner(last.id);
        activeConversationId = last.id;
      } else {
        const conv = createConversation(); activeConversationId = conv.id; addMessage(activeConversationId, 'bot', 'Olá! Eu sou o assistente automático. Descreva em poucas palavras como posso ajudar.'); chatModal.style.display = 'flex'; renderMessages(activeConversationId); updateChatStatusBadge(activeConversationId); chatInput.focus(); }
    });

    closeBtn.addEventListener('click', function() { chatModal.style.display = 'none'; activeConversationId = null; if (chatDecision) chatDecision.style.display = 'none'; if (chatWaitingBanner) chatWaitingBanner.style.display = 'none'; });
    if (closeChatX) closeChatX.addEventListener('click', function() { closeBtn.click(); });

    // Close modal on Esc key
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { if (chatModal && chatModal.style.display === 'flex') closeBtn.click(); } });
    historyBtn.addEventListener('click', function() { window.location.href = 'history.html'; });
    transferBtnEl.addEventListener('click', function() { if (!activeConversationId) return; updateConversationStatus(activeConversationId, 'waiting'); addMessage(activeConversationId, 'bot', 'Conversa encaminhada para atendimento humano. Aguarde, um atendente assumirá em breve.'); renderMessages(activeConversationId); updateChatStatusBadge(activeConversationId); updateWaitingBanner(activeConversationId); startSimulation(activeConversationId); });

    sendBtn.addEventListener('click', function() {
      const text = chatInput.value.trim(); if (!text || !activeConversationId) return;
      const sender = (attendantModeToggle && attendantModeToggle.checked) ? 'attendant' : 'user';
      addMessage(activeConversationId, sender, text);
      renderMessages(activeConversationId);
      updateChatStatusBadge(activeConversationId);
      chatInput.value = '';
      chatInput.focus();
      // If an attendant replied, stop simulated client messages
      if (sender === 'attendant') stopSimulation(activeConversationId);
      // show typing
      showTyping();
      setTimeout(() => {
        const reply = autoReplyText(text);
        hideTyping();
        // For simulation, client replies as 'user' messages
        addMessage(activeConversationId, 'user', reply);
        renderMessages(activeConversationId);
        updateChatStatusBadge(activeConversationId);
      }, 800);
    });
    chatInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { sendBtn.click(); e.preventDefault(); } });

    if (chatContinueBtn) chatContinueBtn.addEventListener('click', function(e) { e.preventDefault(); if (!activeConversationId) return; if (chatDecision) chatDecision.style.display = 'none'; renderMessages(activeConversationId); updateChatStatusBadge(activeConversationId); chatInput.focus(); });
    if (chatNewBtn) chatNewBtn.addEventListener('click', function(e) { e.preventDefault(); const conv = createConversation(); activeConversationId = conv.id; if (chatDecision) chatDecision.style.display = 'none'; addMessage(activeConversationId, 'bot', 'Olá! Eu sou o assistente automático. Descreva em poucas palavras como posso ajudar.'); renderMessages(activeConversationId); updateChatStatusBadge(activeConversationId); chatInput.focus(); });

    if (simulateClientBtn) simulateClientBtn.addEventListener('click', function(e) {
      e.preventDefault(); if (!activeConversationId) { const conv = createConversation(); activeConversationId = conv.id; addMessage(activeConversationId, 'bot', 'Conversa iniciada (simulação).'); }
      if (simulationTimers[activeConversationId]) { stopSimulation(activeConversationId); simulateClientBtn.innerText = 'Simular Cliente'; } else { startSimulation(activeConversationId); simulateClientBtn.innerText = 'Parar Simulação'; }
    });

    // React to new messages created by other tabs or simulation
    window.addEventListener('unify:new_message', function(e) {
      if (!e.detail) return; const convId = e.detail.conversationId; if (convId === activeConversationId) {
        renderMessages(activeConversationId); updateChatStatusBadge(activeConversationId); updateWaitingBanner(activeConversationId);
        // stop simulation if the last message is from an attendant
        const convs = loadConversations(); const conv = convs.find(c => c.id === convId); if (conv && conv.messages.length > 0) { const last = conv.messages[conv.messages.length - 1]; if (last.sender === 'attendant') { stopSimulation(convId); simulateClientBtn && (simulateClientBtn.innerText = 'Simular Cliente'); } }
      }
    });

  }

  function initHistoryPage() {
    const listEl = document.getElementById('conversationsList'); if (!listEl) return; const noEl = document.getElementById('noConversations'); const clearBtn = document.getElementById('clearHistory');
    function formatDate(iso) { const d = new Date(iso); return d.toLocaleString(); }
    function render() {
      const convos = loadConversations();
      listEl.innerHTML = '';
      if (convos.length === 0) {
        noEl.style.display = 'block';
        return;
      }
      noEl.style.display = 'none';

      convos.slice().reverse().forEach(c => {
        const card = document.createElement('div');
        card.className = 'card mb-3 p-3 conv-item';

        // status & badge
        let statusText = 'Aberto';
        let badgeClass = 'bg-primary text-white';
        if (c.status === 'waiting') { statusText = 'Pendente'; badgeClass = 'bg-warning text-dark'; }
        if (c.status === 'closed') { statusText = 'Fechado'; badgeClass = 'bg-success text-white'; }

        // header
        card.innerHTML = `<div class='d-flex justify-content-between align-items-center'><div><strong>Conversa</strong><br><small>${formatDate(c.createdAt)}</small></div><div><small class='me-2'>${c.messages.length} mensagens</small><span class='badge ${badgeClass}'>${statusText}</span></div></div>`;

        // messages
        const messagesContainer = document.createElement('div');
        messagesContainer.style.display = 'none';
        messagesContainer.style.marginTop = '12px';
        messagesContainer.style.display = 'flex';
        messagesContainer.style.flexDirection = 'column';
        c.messages.forEach(m => {
          const mEl = document.createElement('div');
          mEl.className = 'message ' + (m.sender === 'user' ? 'user' : (m.sender === 'attendant' ? 'attendant' : 'bot'));
          mEl.style.maxWidth = '80%';
          if (m.sender === 'user') mEl.style.alignSelf = 'flex-end'; else mEl.style.alignSelf = 'flex-start';
          mEl.innerText = m.text + '\n' + (new Date(m.timestamp).toLocaleString());
          messagesContainer.appendChild(mEl);
        });
        card.appendChild(messagesContainer);
        card.addEventListener('click', function() { messagesContainer.style.display = (messagesContainer.style.display === 'none' ? 'flex' : 'none'); });

        // actions
        const actions = document.createElement('div');
        actions.style.marginTop = '10px';
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const btnOpen = document.createElement('a');
        btnOpen.className = 'btn btn-sm btn-primary';
        btnOpen.href = `atendimento.html?openConv=${c.id}`;
        btnOpen.innerText = 'Abrir';
        btnOpen.addEventListener('click', function(ev){ ev.stopPropagation(); });

        const btnClose = document.createElement('button'); btnClose.className = 'btn btn-sm btn-success'; btnClose.innerText = 'Fechar Conversa';
        const btnReopen = document.createElement('button'); btnReopen.className = 'btn btn-sm btn-outline-secondary'; btnReopen.innerText = 'Reabrir';
        const btnAssume = document.createElement('button'); btnAssume.className = 'btn btn-sm btn-warning'; btnAssume.innerText = 'Assumir Atendimento';

        btnClose.addEventListener('click', function(e){ e.stopPropagation(); if (confirm('Marcar essa conversa como resolvida?')) { c.status = 'closed'; saveConversations(convos); render(); window.dispatchEvent(new CustomEvent('unify:new_message', { detail: { conversationId: c.id } })); } });
        btnReopen.addEventListener('click', function(e){ e.stopPropagation(); c.status = 'open'; saveConversations(convos); render(); window.dispatchEvent(new CustomEvent('unify:new_message', { detail: { conversationId: c.id } })); });
        btnAssume.addEventListener('click', function(e){ e.stopPropagation(); if (confirm('Confirmar que um atendente assumiu essa conversa?')) { c.status = 'open'; c.messages.push({ sender: 'attendant', text: 'Atendente entrou na conversa. Como posso ajudar?', timestamp: new Date().toISOString() }); saveConversations(convos); render(); window.dispatchEvent(new CustomEvent('unify:new_message', { detail: { conversationId: c.id } })); } });

        if (c.status === 'waiting') actions.appendChild(btnAssume);
        actions.appendChild(btnOpen);
        if (c.status !== 'closed') actions.appendChild(btnClose); else actions.appendChild(btnReopen);
        card.appendChild(actions);

        listEl.appendChild(card);
      });
    }
    clearBtn.addEventListener('click', function(){ if (!confirm('Deseja apagar todo o histórico de conversas? Esta ação não pode ser desfeita.')) return; saveConversations([]); render(); });
    render();
  }

  document.addEventListener('DOMContentLoaded', function() { initAtendimentoChat(); initHistoryPage(); });

  window.unify = { loadConversations, saveConversations, createConversation, addMessage, updateConversationStatus, startSimulation, stopSimulation };

  // Listen to cross-tab localStorage changes to stop simulation when an attendant replies in another tab
  window.addEventListener('storage', function(e) {
    if (e.key !== STORAGE_KEY) return;
    try {
      const convos = JSON.parse(e.newValue || '[]');
      convos.forEach(c => {
        if (c.messages && c.messages.length > 0) {
          const last = c.messages[c.messages.length - 1];
          if (last.sender === 'attendant') {
            // stop client simulation for resumed conversation
            stopSimulation(c.id);
          }
        }
      });
    } catch (err) { /* ignore invalid JSON */ }
  });

})();
