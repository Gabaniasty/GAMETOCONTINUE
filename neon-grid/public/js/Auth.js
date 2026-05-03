export class Auth {
  constructor() {
    this._token    = localStorage.getItem('neon_token') || null;
    this._username = localStorage.getItem('neon_user')  || null;
    this._modal    = null;
    this._onLogin  = null; // callback
  }

  isLoggedIn()  { return !!this._token; }
  getToken()    { return this._token; }
  getUsername() { return this._username; }

  logout() {
    this._token    = null;
    this._username = null;
    localStorage.removeItem('neon_token');
    localStorage.removeItem('neon_user');
    location.reload();
  }

  // ── Show the auth modal ──────────────────────────────────────
  showModal(onLogin) {
    this._onLogin = onLogin;
    if (this._modal) { this._modal.style.display = 'flex'; return; }

    const modal = this._modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.innerHTML = `
      <div class="auth-backdrop"></div>
      <div class="auth-box">
        <h2 class="auth-title neon-glow">NEON GRID</h2>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">LOGIN</button>
          <button class="auth-tab" data-tab="register">REGISTER</button>
        </div>

        <div class="auth-error" id="auth-error"></div>

        <form id="auth-form" autocomplete="off">
          <div class="auth-field">
            <label>USERNAME</label>
            <input id="auth-username" type="text" spellcheck="false" autocomplete="off" maxlength="20" />
          </div>
          <div class="auth-field">
            <label>PASSWORD</label>
            <input id="auth-password" type="password" autocomplete="off" />
          </div>
          <button type="submit" class="btn auth-submit" id="auth-submit">LOGIN</button>
        </form>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #auth-modal {
        position:fixed; inset:0; display:flex;
        align-items:center; justify-content:center; z-index:1000;
      }
      .auth-backdrop {
        position:absolute; inset:0;
        background:rgba(10,10,15,.88); backdrop-filter:blur(4px);
      }
      .auth-box {
        position:relative; z-index:1;
        background:#0d0d1a;
        border:1px solid rgba(0,245,255,.35);
        box-shadow:0 0 40px rgba(0,245,255,.12), inset 0 0 60px rgba(0,245,255,.03);
        padding:2.5rem 2rem 2rem;
        width:min(420px, 92vw);
        display:flex; flex-direction:column; gap:1.2rem;
        clip-path:polygon(12px 0%,100% 0%,calc(100% - 12px) 100%,0% 100%);
      }
      .auth-title {
        font-size:1.6rem; font-weight:900; letter-spacing:.2em;
        color:#00f5ff; text-align:center; margin:0;
      }
      .auth-tabs {
        display:flex; gap:.5rem; border-bottom:1px solid rgba(0,245,255,.2);
        padding-bottom:.75rem;
      }
      .auth-tab {
        flex:1; background:transparent;
        border:1px solid transparent;
        font-family:'Orbitron',sans-serif; font-size:.65rem;
        letter-spacing:.18em; color:rgba(224,224,255,.45);
        padding:.5rem; cursor:pointer; transition:all .2s;
      }
      .auth-tab.active, .auth-tab:hover {
        border-color:rgba(0,245,255,.4); color:#00f5ff;
        background:rgba(0,245,255,.06);
        box-shadow:0 0 8px rgba(0,245,255,.2);
      }
      .auth-error {
        color:#ff2d78; font-size:.65rem; letter-spacing:.1em;
        min-height:1rem; text-align:center;
        text-shadow:0 0 6px #ff2d78;
      }
      #auth-form { display:flex; flex-direction:column; gap:1rem; }
      .auth-field { display:flex; flex-direction:column; gap:.35rem; }
      .auth-field label {
        font-size:.6rem; letter-spacing:.2em;
        color:rgba(224,224,255,.5);
      }
      .auth-field input {
        background:rgba(0,245,255,.05);
        border:1px solid rgba(0,245,255,.25);
        color:#e0e0ff; font-family:'Orbitron',sans-serif;
        font-size:.8rem; padding:.6rem .75rem;
        outline:none; transition:border-color .2s, box-shadow .2s;
      }
      .auth-field input:focus {
        border-color:#00f5ff;
        box-shadow:0 0 8px rgba(0,245,255,.3);
      }
      .auth-submit { width:100%; margin-top:.5rem; font-size:.8rem; padding:.8rem; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);

    let activeTab = 'login';

    const tabs   = modal.querySelectorAll('.auth-tab');
    const submit = modal.querySelector('#auth-submit');
    const errEl  = modal.querySelector('#auth-error');
    const form   = modal.querySelector('#auth-form');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
        submit.textContent = activeTab === 'login' ? 'LOGIN' : 'REGISTER';
        errEl.textContent = '';
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.textContent = '';
      const username = modal.querySelector('#auth-username').value.trim();
      const password = modal.querySelector('#auth-password').value;
      submit.disabled = true;
      submit.textContent = activeTab === 'login' ? 'LOGGING IN…' : 'REGISTERING…';

      try {
        const res = await fetch(`/auth/${activeTab}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Error'; return; }

        this._token    = data.token;
        this._username = data.username;
        localStorage.setItem('neon_token', data.token);
        localStorage.setItem('neon_user',  data.username);
        // Also store for game use
        localStorage.setItem('ng_username', data.username);

        modal.style.display = 'none';
        if (this._onLogin) this._onLogin(data.username);
      } catch (err) {
        errEl.textContent = 'Network error';
      } finally {
        submit.disabled  = false;
        submit.textContent = activeTab === 'login' ? 'LOGIN' : 'REGISTER';
      }
    });

    // Close on backdrop click
    modal.querySelector('.auth-backdrop').addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
}
