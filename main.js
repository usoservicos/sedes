import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- substitua aqui com suas credenciais ---
  const SUPABASE_URL = 'https://qisspezxckvhksgwwqaq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpc3NwZXp4Y2t2aGtzZ3d3cWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTg2MzEsImV4cCI6MjA3NzkzNDYzMX0.W0jpA6j_wsKRw0rNEZvyTmOPZrlO9muky7LhhcRJENE';
  // -----------------------------------------
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ELEMENTS
  const status = document.getElementById('status');
  const btnSignup = document.getElementById('btnSignup');
  const btnSignin = document.getElementById('btnSignin');
  const btnSignout = document.getElementById('btnSignout');
  const saveProfile = document.getElementById('saveProfile');
  const profileEditor = document.getElementById('profileEditor');
  const deckEl = document.getElementById('deck');
  const btnLike = document.getElementById('btnLike');
  const btnNope = document.getElementById('btnNope');
  const matchesList = document.getElementById('matchesList');
  const messagesEl = document.getElementById('messages');
  const chatArea = document.getElementById('chatArea');
  const chatPlaceholder = document.getElementById('chatPlaceholder');
  const sendMsg = document.getElementById('sendMsg');

  let user = null;
  let deck = []; // public_profiles
  let currentTop = null;
  let currentMatch = null;

  // Auth events
  supabase.auth.onAuthStateChange((event, session) => {
    user = session?.user || null;
    updateUI();
    if(user){
      loadOrCreateProfile();
      subscribeRealtime();
      loadDeck();
      loadMatches();
    } else {
      deckEl.innerHTML = 'Faça login para ver o deck';
      matchesList.innerHTML = '';
    }
  });

  // Signup / Signin handlers
  btnSignup.onclick = async () => {
    const email = document.getElementById('su_email').value;
    const password = document.getElementById('su_password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if(error) return alert(error.message);
    alert('Email de confirmação enviado (se estiver ativado). Use o mesmo email para entrar.');
  };

  btnSignin.onclick = async () => {
    const email = document.getElementById('in_email').value;
    const password = document.getElementById('in_password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) return alert(error.message);
    user = data.user;
    updateUI();
  };

  btnSignout.onclick = async () => {
    await supabase.auth.signOut();
    user = null;
    updateUI();
  };

  function updateUI(){
    if(user){
      status.textContent = `Autenticado: ${user.email}`;
      btnSignout.style.display = 'inline-block';
      profileEditor.style.display = 'block';
    } else {
      status.textContent = 'Não autenticado';
      btnSignout.style.display = 'none';
      profileEditor.style.display = 'none';
    }
  }

  // create or load profile (profiles table protected by RLS)
  async function loadOrCreateProfile(){
    const id = user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    if(error && error.code !== 'PGRST116') { /* PGRST116 = no rows */ }
    if(data){
      // fill editor
      document.getElementById('name').value = data.full_name || '';
      document.getElementById('avatar').value = data.avatar || '';
      document.getElementById('current_sede').value = data.current_sede || 'Sede 1';
      document.getElementById('desired_sede').value = data.desired_sede || 'Sede 2';
    }
  }

  // save profile (upsert)
  saveProfile.onclick = async () => {
    const payload = {
      id: user.id,
      full_name: document.getElementById('name').value,
      email: user.email,
      current_sede: document.getElementById('current_sede').value,
      desired_sede: document.getElementById('desired_sede').value,
      avatar: document.getElementById('avatar').value || `https://picsum.photos/seed/${encodeURIComponent(user.id)}/400/300`
    };

    // profiles (private)
    const { error: e1 } = await supabase.from('profiles').upsert(payload);
    // public_profiles (minimal) - used publicly in deck
    const pub = {
      id: user.id,
      current_sede: payload.current_sede,
      desired_sede: payload.desired_sede,
      avatar: payload.avatar
    };
    const { error: e2 } = await supabase.from('public_profiles').upsert(pub);

    if(e1 || e2) return alert('Erro ao salvar perfil: ' + (e1?.message || e2?.message));
    alert('Perfil salvo');
    loadDeck();
  };

  // load public deck (apenas public_profiles)
  async function loadDeck(){
    // buscamos profiles públicos que não sejam o próprio usuário e com current_sede diferente (exemplo)
    const { data, error } = await supabase
      .from('public_profiles')
      .select('*')
      .neq('id', user.id)
      .order('updated_at', { ascending: false });

    if(error) return console.error(error);
    deck = data || [];
    renderDeck();
  }

  function renderDeck(){
    deckEl.innerHTML = '';
    if(deck.length === 0) { deckEl.innerHTML = '<div class="small">Sem perfis no momento</div>'; currentTop = null; return; }
    // empilha cards
    deck.slice().reverse().forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'profile-card';
      div.style.zIndex = 100 - i;
      div.innerHTML = `<img src="${p.avatar}" alt=""><div class="profile-body"><div><strong>${p.current_sede} → ${p.desired_sede}</strong><div class="small">ID: ${p.id.slice(-6)}</div></div><div class="small">Clique ♥ para curtir</div></div>`;
      deckEl.appendChild(div);
      // click like
      div.onclick = () => { currentTop = p; doLike(p.id); };
    });
    currentTop = deck[0];
  }

  // like action: insere na tabela likes (RLS garante liker = auth.uid())
  async function doLike(targetId){
    const payload = { liker: user.id, liked: targetId };
    const { error } = await supabase.from('likes').insert([payload]);
    if(error && error.code !== 'PGRST116') { // ignore duplicate error handling here
      console.error(error); alert('Erro ao curtir: '+error.message);
    } else {
      alert('Curtir registrado (se houver reciprocidade e sedes compatíveis, será criado um match).');
      // refresh deck
      await loadDeck();
    }
  }

  btnLike.onclick = () => {
    if(currentTop) doLike(currentTop.id);
  };

  btnNope.onclick = () => {
    // estratégia simples: remover o top card visualmente
    if(deck.length) deck.shift();
    renderDeck();
  };

  // load matches for current user
  async function loadMatches(){
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .or(`a_id.eq.${user.id},b_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if(error) return console.error(error);
    matchesList.innerHTML = '';
    data.forEach(m => {
      const otherId = (m.a_id === user.id) ? m.b_id : m.a_id;
      // fetch public data for other
      (async () => {
        const { data: other } = await supabase.from('public_profiles').select('*').eq('id', otherId).single();
        const div = document.createElement('div');
        div.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><img src="${other.avatar}" style="width:44px;height:44px;border-radius:8px"><div><strong>${other.current_sede} → ${other.desired_sede}</strong><div class="small">ID ${other.id.slice(-6)}</div></div></div><button style="margin-left:auto">Abrir</button>`;
        div.querySelector('button').onclick = () => openChat(m.id);
        matchesList.appendChild(div);
      })();
    });
  }

  // Realtime subscription: matches and messages
  function subscribeRealtime(){
    // unsubscribe previous
    // note: supabase-js v2 uses .channel for realtime
    // we'll use simple subscriptions to tables: matches and messages
    supabase.channel('public:matches')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' },
        payload => {
          // se o novo match inclui o user, recarrega matches
          const row = payload.record;
          if(row.a_id === user.id || row.b_id === user.id) {
            alert('Novo match!');
            loadMatches();
          }
      }).subscribe();

    supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const msg = payload.record;
          if(currentMatch && msg.match_id === currentMatch.id) {
            appendMessage(msg);
          }
      }).subscribe();
  }

  // Chat: abrir match e carregar mensagens
  async function openChat(matchId){
    currentMatch = { id: matchId };
    chatArea.style.display = 'flex';
    chatPlaceholder.style.display = 'none';
    messagesEl.innerHTML = '';
    const { data } = await supabase.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending:true });
    data.forEach(appendMessage);
  }

  function appendMessage(msg){
    const div = document.createElement('div');
    div.className = 'small';
    div.style.padding = '6px';
    div.style.margin = '6px 0';
    if(msg.from_id === user.id){ div.style.textAlign = 'right'; div.style.background = '#043a2b'; }
    else { div.style.textAlign = 'left'; div.style.background = '#062b3a'; }
    div.textContent = msg.text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  sendMsg.onclick = async () => {
    if(!currentMatch) return alert('Abra um match');
    const text = document.getElementById('chatInput').value;
    if(!text) return;
    await supabase.from('messages').insert([{ match_id: currentMatch.id, from_id: user.id, text }]);
    document.getElementById('chatInput').value = '';
  };

  // inicial
  (async () => {
    const { data: session } = await supabase.auth.getSession();
    if(session?.session?.user) user = session.session.user;
    updateUI();
    if(user){
      loadOrCreateProfile();
      loadDeck();
      loadMatches();
      subscribeRealtime();
    }
  })();