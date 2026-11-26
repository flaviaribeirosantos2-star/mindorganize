// Sincronização da Minha Agenda com o Firebase (login por e-mail e senha + Firestore).
// O app funciona sem isto: os dados ficam sempre também no aparelho e sobem quando há internet.
const A = window.__agenda;
const cfg = window.FIREBASE_CONFIG;
const box = document.getElementById('acct');
const V = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const esc = A.esc;

let dirty = lsGet('sync-dirty') === '1';
let base = Number(lsGet('sync-base') || 0); // "updated" da última versão igual na nuvem e no aparelho
const setDirty = v => { dirty = v; lsSet('sync-dirty', v ? '1' : '0'); };
const setBase = v => { base = v || 0; lsSet('sync-base', String(base)); };

// Toda mudança feita enquanto não está conectada fica marcada para subir depois.
A.onSave = () => setDirty(true);

function show(html) { box.hidden = false; box.innerHTML = html; }

const MSG = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe conta com esse e-mail. Use “Criar conta”.',
  'auth/invalid-email': 'Esse e-mail não parece válido.',
  'auth/email-already-in-use': 'Já existe conta com esse e-mail. Use “Entrar”.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/missing-password': 'Digite a senha.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos.',
  'auth/network-request-failed': 'Sem internet. Tente de novo quando conectar.',
  'auth/admin-restricted-operation': 'A criação de novas contas está desligada neste app.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'O código do Firebase (apiKey) no firebase-config.js está com alguma letra errada. Me mande um print.',
  'auth/invalid-api-key': 'O código do Firebase (apiKey) no firebase-config.js está com alguma letra errada. Me mande um print.',
  'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no Firebase (passo 2 do guia).',
};
const msg = e => MSG[e && e.code] || ('Não deu certo: ' + ((e && (e.code || e.message)) || 'erro desconhecido'));

if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('COLE')) {
  show('<b>Nuvem não configurada</b><span>Os dados estão salvos só neste aparelho. Para ver os mesmos dados no celular e no computador, siga o passo a passo e preencha o arquivo firebase-config.js.</span>');
  A.setSync('Salvo só neste aparelho');
} else {
  start().catch(() => {
    show('<b><span class="on off">Sem conexão com a nuvem</span></b><span>Tudo continua salvo neste aparelho. Quando tiver internet, recarregue o app para sincronizar.</span>');
    A.setSync('Salvo neste aparelho, sem internet');
  });
}

async function start() {
  const [appM, authM, fsM] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js'),
  ]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  const db = fsM.getFirestore(app);

  let ref = null, unsub = null, pushing = false, again = false, timer = null, email = '';

  const plain = o => JSON.parse(JSON.stringify(o)); // o Firestore não aceita "undefined"
  const hasData = S => S.events.length || S.tasks.length || S.exp.length || Object.keys(S.sugar).length;

  function status(text, ok) {
    window.__cloudOK = !!ok; try { A.bkUI(); } catch (e) {}
    show(`<b>Sincronização</b><span class="on${ok ? '' : ' off'}">${esc(text)}</span><span>Conectada como ${esc(email)}</span><button class="lk" id="out">Sair desta conta</button>`);
    document.getElementById('out').onclick = () => authM.signOut(auth);
  }

  async function push() {
    if (!ref) return;
    if (pushing) { again = true; return; }
    pushing = true;
    const S = A.get();
    if (!navigator.onLine) status('Sem internet: envia quando conectar', false);
    try {
      await fsM.setDoc(ref, plain({ events: S.events, tasks: S.tasks, exp: S.exp, sugar: S.sugar, cfg: S.cfg, updated: S.updated }));
      if (A.get().updated === S.updated) setDirty(false);
      setBase(S.updated);
      A.setSync('Salvo na nuvem'); status('Tudo salvo na nuvem', true);
    } catch (e) {
      A.setSync('Salvo no aparelho; envia quando tiver internet'); status('Esperando internet para enviar', false);
    }
    pushing = false;
    if (again) { again = false; push(); }
  }

  A.onSave = () => { setDirty(true); if (ref) { clearTimeout(timer); timer = setTimeout(push, 700); } };
  addEventListener('online', () => { if (dirty && ref) push(); });

  // Junta duas versões editadas ao mesmo tempo (ex.: celular sem internet + computador).
  function merge(L, R) {
    const byId = (loc, rem) => { const m = new Map((rem || []).map(x => [x.id, x])); (loc || []).forEach(x => m.set(x.id, x)); return [...m.values()]; };
    return { events: byId(L.events, R.events), tasks: byId(L.tasks, R.tasks), exp: byId(L.exp, R.exp), sugar: { ...(R.sugar || {}), ...(L.sugar || {}) }, cfg: L.cfg || R.cfg, updated: Date.now() };
  }

  function loginForm(err) {
    show(`<b>Entrar para sincronizar</b><span>Use o mesmo e-mail e senha no celular e no computador.</span>
      <form id="lf"><input id="le" type="email" autocomplete="username" placeholder="E-mail" aria-label="E-mail" required>
      <input id="lp" type="password" autocomplete="current-password" placeholder="Senha (mín. 6 caracteres)" aria-label="Senha" required>
      ${err ? `<span class="err">${esc(err)}</span>` : ''}
      <div class="nb"><button class="btn" id="lin">Entrar</button><button type="button" class="btn" id="lnew">Criar conta</button></div>
      <button type="button" class="lk" id="lfor">Esqueci a senha</button></form>`);
    const em = () => document.getElementById('le').value.trim(), pw = () => document.getElementById('lp').value;
    const keep = em; // mantém o e-mail digitado ao mostrar um erro
    const fail = e => { const v = keep(); loginForm(msg(e)); document.getElementById('le').value = v; };
    document.getElementById('lf').onsubmit = e => { e.preventDefault(); authM.signInWithEmailAndPassword(auth, em(), pw()).catch(fail); };
    document.getElementById('lnew').onclick = () => { if (!em() || !pw()) return fail({ code: !em() ? 'auth/invalid-email' : 'auth/missing-password' }); authM.createUserWithEmailAndPassword(auth, em(), pw()).catch(fail); };
    document.getElementById('lfor').onclick = () => { if (!em()) return fail({ code: 'auth/invalid-email' }); authM.sendPasswordResetEmail(auth, em()).then(() => { A.toast('Enviamos um e-mail para trocar a senha'); }).catch(fail); };
  }

  authM.onAuthStateChanged(auth, user => {
    if (unsub) { unsub(); unsub = null; }
    ref = null;
    if (!user) { loginForm(); A.setSync('Salvo só neste aparelho'); return; }
    email = user.email || '';
    ref = fsM.doc(db, 'agendas', user.uid);
    status('Conectando…', false);
    unsub = fsM.onSnapshot(ref, snap => {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      const d = snap.exists() ? snap.data() : null;
      const S = A.get();
      if (!d) { if (hasData(S)) push(); else status('Tudo salvo na nuvem', true); return; }
      const ru = d.updated || 0;
      if (ru === S.updated) { if (!pushing) setDirty(false); setBase(ru); status('Tudo salvo na nuvem', true); A.setSync('Salvo na nuvem'); return; }
      if (dirty) {
        if (ru === base) push();                       // só este aparelho mudou
        else { A.replace(merge(S, d)); push(); A.toast('Juntei as mudanças deste aparelho com as da nuvem'); }
        return;
      }
      A.replace(d); setBase(ru); setDirty(false);       // outro aparelho mudou
      status('Tudo salvo na nuvem', true); A.setSync('Salvo na nuvem');
    }, err => {
      status(err && err.code === 'permission-denied' ? 'Sem permissão: confira as regras do Firestore (passo 3 do guia)' : 'Erro ao ler a nuvem', false);
    });
  });
}
