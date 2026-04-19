function checkAuth(req, res, next) {
  if (process.env.CMS_PASSWORD === '' || !process.env.CMS_PASSWORD) return next();
  
  if (req.cookies && req.cookies.cms_auth === 'authenticated') {
    return next();
  }
  
  if (req.path.startsWith('/api') && !req.path.startsWith('/api/public') && !req.path.startsWith('/api/auth')) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  
  // Public HTML for login
  res.status(401).send(`
  <html>
    <head><title>WebTools Login</title></head>
    <body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f4f7fe; margin:0;">
      <div style="background:white; padding:40px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.1); width:350px;">
        <h2 style="margin-top:0; color:#2b3674; text-align:center;">Vào CMS WebTools</h2>
        <input type="password" id="pwd" placeholder="Nh?p M?t Kh?u..." style="width:100%; padding:12px; margin:20px 0; border:1px solid #e2e8f0; border-radius:8px; box-sizing:border-box;">
        <button onclick="login()" style="width:100%; padding:12px; background:#4318FF; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">ÐANG NH?P</button>
      </div>
      <script>
        function login() {
          fetch('/api/auth/login', { 
            method:'POST', 
            headers:{ 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ password: document.getElementById('pwd').value }) 
          }).then(r => r.json()).then(d => {
            if(d.success) window.location.reload(); else alert('Sai m?t kh?u!');
          });
        }
      </script>
    </body>
  </html>`);
}

module.exports = { checkAuth };
