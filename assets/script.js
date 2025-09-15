// ------- Helpers & Theme -------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const byId = id => document.getElementById(id);

// Safe setter
const setText = (el, text) => { if (el) el.textContent = text; };

// Theme toggle (guarded)
const themeBtn = byId('themeBtn');
const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
const savedTheme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
applyTheme(savedTheme);
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next); localStorage.setItem('theme', next);
  });
}
setText(byId('year'), new Date().getFullYear().toString());

// Smooth scrolling for anchor links (guarded)
$$('.nav-links a, .cta a').forEach(a => a.addEventListener('click', e => {
  const href = a.getAttribute('href') || '';
  if(href.startsWith('#') && $(href)){ e.preventDefault(); $(href).scrollIntoView({behavior:'smooth'}); }
}));

// ------- Chatbot (Site Assistant) -------
const chatBtn   = byId('chatBtn');
const chatPanel = byId('chatPanel');
const sendBtn   = byId('sendBtn');
const input     = byId('chatInput');
const closeChat = byId('closeChat');
const chatBody  = byId('chatBody');

const openChat = () => {
  if (!chatPanel || !input) return;
  chatPanel.classList.add('open');
  chatPanel.setAttribute('aria-modal','true');
  input.focus();
};
const hideChat = () => {
  if (!chatPanel || !chatBtn) return;
  chatPanel.classList.remove('open');
  chatPanel.setAttribute('aria-modal','false');
  chatBtn.focus();
};

if (chatBtn)   chatBtn.addEventListener('click', openChat);
if (closeChat) closeChat.addEventListener('click', hideChat);
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && chatPanel && chatPanel.classList.contains('open')) hideChat(); });

const addBubble = (html, who='ai') => {
  if (!chatBody) return;
  const b = document.createElement('div');
  b.className = `bubble ${who}`;
  b.innerHTML = html;
  chatBody.appendChild(b);
  chatBody.scrollTop = chatBody.scrollHeight;
};
const chips = (arr=[]) => `<div class="suggestions">${arr.map(c=>`<span class="chip" data-q="${c}">${c}</span>`).join('')}</div>`;

if (chatBody) {
  chatBody.addEventListener('click', (e)=>{
    const t = e.target.closest('.chip');
    if(!t || !input) return;
    input.value = t.dataset.q;
    handleSend();
  });
}

const greet = () => addBubble(`Hi! I can help you find info on this site. Try: ${chips(['show resume','python projects','how to contact you','list skills'])}`);

// ------- Search Index (now fully guarded so nulls don't crash) -------
const index = [];
const addToIndex = (title, text, anchor) => {
  index.push({title, text: (text||'').replace(/\s+/g,' ').trim(), anchor});
};

// Sections (only index if they exist)
try {
  const intro = $('.intro');            if (intro) addToIndex('Home', intro.innerText, '#home');
  const about = byId('about');          if (about) addToIndex('About', about.innerText, '#about');
  const resume = byId('resume');        if (resume) addToIndex('Resume', resume.innerText, '#resume');
  const projects = byId('projects');    if (projects) addToIndex('Projects', projects.innerText, '#projects');
  const contact = byId('contact');      if (contact) addToIndex('Contact', contact.innerText, '#contact');

  $$('.project').forEach(p=>{
    const title = p.dataset.title || (p.querySelector('h3')?.textContent) || 'Project';
    addToIndex(`Project: ${title}`, p.innerText, p.dataset.anchor || `#${p.id}`);
  });
} catch (err) {
  console.error('Indexing error:', err);
}

// Tokenize & score
const tokenize = s => s.toLowerCase().replace(/[^a-z0-9\s#\-]/g,' ').split(/\s+/).filter(Boolean);
const scoreDoc = (qTokens, doc) => {
  const dt = tokenize((doc.text||'') + ' ' + (doc.title||''));
  let score = 0; const set = new Set(dt);
  qTokens.forEach(tok=>{ if(set.has(tok)) score += 3; });
  qTokens.forEach(tok=>{ if((doc.title||'').toLowerCase().includes(tok)) score += 4; });
  return score;
};

// Direct commands
const answerCommand = (q) => {
  const s = (q||'').toLowerCase();
  const go = anchor => {
    if (!anchor || !document.querySelector(anchor)) return false;
    addBubble(`Here you go → <a href="${anchor}">${anchor}</a> (scrolling…)`);
    document.querySelector(anchor).scrollIntoView({behavior:'smooth'});
    return true;
  };
  if(/resume|cv|curriculum|résumé/.test(s)) return go('#resume');
  if(/contact|email|reach|message/.test(s))  return go('#contact');
  if(/about|bio|who are you/.test(s))        return go('#about');
  if(/project|portfolio|work/.test(s) && !/python|web|ai|javascript|data|viz|education/.test(s)) return go('#projects');

  // Tag filtering
  const tagMatch = s.match(/python|web|ai|javascript|data|viz|education|ui/);
  if(tagMatch){
    const tag = tagMatch[0];
    const hits = $$('.project').filter(p=> (p.dataset.tags||'').includes(tag));
    if(hits.length){
      const list = hits.map(p=>`<li><a href="#${p.id}">${p.dataset.title||p.querySelector('h3')?.textContent||'Project'}</a> <span class="muted">— ${p.dataset.tags}</span></li>`).join('');
      addBubble(`I found ${hits.length} ${tag} project(s):<ul>${list}</ul>`);
      return true;
    }
  }

  if(/skill|stack|tools?/.test(s)){
    const skills = $$('#resume .badge').map(b=>b.textContent).join(', ');
    addBubble(`Skills on my résumé: ${skills || '—'}.`);
    return true;
  }
  if(/education|school|major/.test(s)){
    const eduLi = $('#resume .resume-grid .resume-card ul li');
    if (eduLi) addBubble(`Education snapshot: ${eduLi.textContent}`);
    else addBubble('Education details are on the résumé section.');
    return true;
  }
  return false;
};

const searchSite = (q) => {
  const qTokens = tokenize(q).filter(t => t.length>1);
  const ranked = index.map(doc=>({doc, score: scoreDoc(qTokens, doc)}))
                      .filter(r=>r.score>0)
                      .sort((a,b)=>b.score-a.score)
                      .slice(0,4);
  if(!ranked.length){
    addBubble("I couldn't find that on this site. Try ‘resume’, ‘projects’, or ‘contact’.");
    return;
  }
  const html = ranked.map(r=>`<li><a href="${r.doc.anchor}"><strong>${r.doc.title}</strong></a><br><span class="muted">…${(r.doc.text||'').slice(0,140)}…</span></li>`).join('');
  addBubble(`<div>These look relevant:</div><ul>${html}</ul>`);
};

const handleSend = () => {
  if (!input) return;
  const q = input.value.trim();
  if(!q) return;
  addBubble(q, 'me');
  input.value = '';
  if(answerCommand(q)) return;
  searchSite(q);
};

if (sendBtn) sendBtn.addEventListener('click', handleSend);
if (input)   input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleSend(); }});

// Auto-greet on first open
let greeted = false;
if (chatBtn) chatBtn.addEventListener('click', ()=>{ if(!greeted){ greet(); greeted=true; } });

// Shortcut to open chat: '/'
window.addEventListener('keydown', (e)=>{
  if (!chatPanel) return;
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if(e.key==='/' && tag!=='input' && tag!=='textarea') {
    e.preventDefault(); openChat();
    if(!greeted){ greet(); greeted=true; }
  }
});
