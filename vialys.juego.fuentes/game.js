(function(){
  const app = document.getElementById('app');
  const gameArea = document.getElementById('gameArea');
  const canvas = document.getElementById('road');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const meterFill = document.getElementById('meterFill');
  const distVal = document.getElementById('distVal');
  const clearedVal = document.getElementById('clearedVal');
  const vignette = document.getElementById('vignette');
  const flashEl = document.getElementById('flash');

  // ---- Pixel-art post-processing: render at full res, then mosaic it down/up ----
  const PIXEL_SCALE = 3.2; // higher = chunkier pixels
  const pixelCanvas = document.createElement('canvas');
  const pixelCtx = pixelCanvas.getContext('2d');

  let W,H;
  function resize(){
    const r = gameArea.getBoundingClientRect();
    W = canvas.width = r.width;
    H = canvas.height = r.height;
    pixelCanvas.width = Math.max(1, Math.round(W / PIXEL_SCALE));
    pixelCanvas.height = Math.max(1, Math.round(H / PIXEL_SCALE));
  }
  window.addEventListener('resize', resize);

  function pixelateFrame(){
    // downscale with smoothing (averages each block of pixels)...
    pixelCtx.imageSmoothingEnabled = true;
    pixelCtx.clearRect(0,0,pixelCanvas.width,pixelCanvas.height);
    pixelCtx.drawImage(canvas, 0,0,W,H, 0,0,pixelCanvas.width,pixelCanvas.height);
    // ...then upscale back with smoothing OFF (blocky, nearest-neighbor) for the pixel-art look
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(pixelCanvas, 0,0,pixelCanvas.width,pixelCanvas.height, 0,0,W,H);
  }

  // ---- Game state ----
  const LANES = 3;
  let laneX = [];
  let laneWidth;
  let player = { lane:1, x:0, y:0, w:46, h:78, targetX:0 };
  let obstacles = [];
  let notifications = [];
  let running = false;
  let distance = 0;
  let speed = 3.2;
  let baseSpeed = 3.2;
  let attention = 100; // 100 = full attention, 0 = crash
  let clearedCount = 0;
  let spawnObstacleTimer = 0;
  let spawnNotifTimer = 0;
  let elapsed = 0;
  let roadOffset = 0;
  let ending = false;

  const SKINS = [
    {id:'cybertruck', name:'Cyber Truck', emoji:'🚙', color:'#c7cad2'},
    {id:'ferrari',    name:'Ferrari',     emoji:'🏎️', color:'#e01522'},
    {id:'beetle',     name:'Beetle',      emoji:'🚗', color:'#e8b23a'},
    {id:'supra',      name:'Supra',       emoji:'🏁', color:'#ff8a00'},
    {id:'batimovil',  name:'Batimóvil',   emoji:'🦇', color:'#1a1b1f'},
  ];
  let selectedSkin = 'cybertruck';

  // Sprite-based Supra skin (user-provided artwork)
  const SUPRA_SPRITE_SRC = 'images/supra.png';
  const supraImg = new Image();
  let supraReady = false;
  supraImg.onload = ()=>{ supraReady = true; };
  supraImg.src = SUPRA_SPRITE_SRC;

  // Sprite-based Ferrari skin (user-provided artwork)
  const FERRARI_SPRITE_SRC = 'images/ferrari.png';
  const ferrariImg = new Image();
  let ferrariReady = false;
  ferrariImg.onload = ()=>{ ferrariReady = true; };
  ferrariImg.src = FERRARI_SPRITE_SRC;

  // Sprite-based Beetle skin (user-provided artwork)
  const BEETLE_SPRITE_SRC = 'images/beetle.png';
  const beetleImg = new Image();
  let beetleReady = false;
  beetleImg.onload = ()=>{ beetleReady = true; };
  beetleImg.src = BEETLE_SPRITE_SRC;

  // Sprite-based Batimovil skin (user-provided artwork)
  const BATIMOVIL_SPRITE_SRC = 'images/batimovil.png';
  const batimovilImg = new Image();
  let batimovilReady = false;
  batimovilImg.onload = ()=>{ batimovilReady = true; };
  batimovilImg.src = BATIMOVIL_SPRITE_SRC;

  // Sprite-based Cybertruck skin (user-provided artwork)
  const CYBER_SPRITE_SRC = 'images/cybertruck.png';
  const cyberImg = new Image();
  let cyberReady = false;
  cyberImg.onload = ()=>{ cyberReady = true; };
  cyberImg.src = CYBER_SPRITE_SRC;


  const NOTIF_TEMPLATES = [
    {icon:'💬', app:'WhatsApp', msg:'Mamá: ¿ya vienes a comer?'},
    {icon:'📸', app:'Instagram', msg:'alguien te etiquetó en una historia'},
    {icon:'🎵', app:'Spotify', msg:'Se está reproduciendo: Lo-fi para manejar'},
    {icon:'📞', app:'Llamada', msg:'Número desconocido está llamando'},
    {icon:'🐦', app:'X', msg:'Tendencia: #TráficoVillahermosa'},
    {icon:'🎓', app:'CECyTE 7', msg:'Recordatorio: entrega de proyecto mañana'},
    {icon:'📢', app:'Grupo escolar', msg:'CECyTE Plantel 7: cambio de salón para el examen'},
    {icon:'🌴', app:'Clima Tabasco', msg:'Lluvia fuerte prevista en Villahermosa'},
    {icon:'✉️', app:'Correo', msg:'Confirma tu pedido antes de que expire'},
    {icon:'🎮', app:'Juego', msg:'¡Tu vida se está recargando!'},
    {icon:'📍', app:'Maps', msg:'Ruta más rápida disponible'},
    {icon:'❤️', app:'Tinder', msg:'¡Tienes un nuevo match!'},
    {icon:'🔋', app:'Sistema', msg:'Batería al 15%'},
  ];

  function setupLanes(){
    laneWidth = W / LANES;
    laneX = [];
    for(let i=0;i<LANES;i++){
      laneX.push(laneWidth*i + laneWidth/2);
    }
    player.x = laneX[player.lane];
    player.targetX = player.x;
    player.y = H - player.h - 24;
  }

  function reset(){
    obstacles = [];
    notifications.forEach(n=>n.el.remove());
    notifications = [];
    distance = 0;
    speed = baseSpeed;
    attention = 100;
    clearedCount = 0;
    spawnObstacleTimer = 0;
    spawnNotifTimer = 60;
    elapsed = 0;
    roadOffset = 0;
    ending = false;
    player.lane = 1;
    setupLanes();
    updateHUD();
  }

  function updateHUD(){
    distVal.textContent = Math.floor(distance) + ' m';
    clearedVal.textContent = clearedCount;
    meterFill.style.width = Math.max(0,attention) + '%';
  }

  // ---- Input ----
  const keys = {};
  window.addEventListener('keydown', e=>{
    if(['ArrowLeft','ArrowRight','a','d','A','D'].includes(e.key)) e.preventDefault();
    if((e.key==='ArrowLeft'||e.key==='a'||e.key==='A') && !keys.left){
      keys.left = true; moveLane(-1);
    }
    if((e.key==='ArrowRight'||e.key==='d'||e.key==='D') && !keys.right){
      keys.right = true; moveLane(1);
    }
  });
  window.addEventListener('keyup', e=>{
    if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') keys.left=false;
    if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') keys.right=false;
  });

  // swipe controls for touch
  let touchStartX = null;
  gameArea.addEventListener('touchstart', e=>{
    touchStartX = e.touches[0].clientX;
  });
  gameArea.addEventListener('touchend', e=>{
    if(touchStartX===null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if(Math.abs(dx) > 30){ moveLane(dx>0?1:-1); }
    touchStartX = null;
  });

  function moveLane(dir){
    if(!running) return;
    player.lane = Math.min(LANES-1, Math.max(0, player.lane+dir));
    player.targetX = laneX[player.lane];
  }

  // ---- Notifications ----
  function spawnNotification(){
    const t = NOTIF_TEMPLATES[Math.floor(Math.random()*NOTIF_TEMPLATES.length)];
    const el = document.createElement('div');
    el.className = 'notif';
    const maxX = Math.max(0, W - 210);
    const maxY = Math.max(60, H*0.55);
    const x = 8 + Math.random()*maxX;
    const y = 50 + Math.random()*(maxY-50);
    el.style.left = x+'px';
    el.style.top = y+'px';
    el.innerHTML = `
      <span class="xhint">✕</span>
      <div class="row"><span class="icon">${t.icon}</span><span class="app">${t.app}</span></div>
      <div class="msg">${t.msg}</div>
      <div class="life"><i></i></div>
    `;
    const lifespan = 4200 + Math.random()*1800; // ms before it starts really hurting
    const born = performance.now();
    const obj = { el, born, lifespan, closed:false };
    el.addEventListener('click', ()=>{
      if(obj.closed) return;
      obj.closed = true;
      clearedCount++;
      el.style.transition='transform .15s ease-in, opacity .15s ease-in';
      el.style.transform='scale(.5)';
      el.style.opacity='0';
      setTimeout(()=>el.remove(), 160);
      attention = Math.min(100, attention + 3);
    });
    gameArea.appendChild(el);
    notifications.push(obj);
  }

  function updateNotifications(dtMs){
    let activePenalty = 0;
    notifications = notifications.filter(n=>{
      if(n.closed) return false;
      const age = performance.now() - n.born;
      const lifeBar = n.el.querySelector('.life i');
      const pct = Math.max(0, 100 - (age/n.lifespan)*100);
      if(lifeBar) lifeBar.style.width = pct+'%';
      activePenalty += 1;
      return true;
    });
    // each active, un-dismissed notification chips away at attention
    if(activePenalty>0){
      attention -= (0.028 * activePenalty) * (dtMs/16.6);
    } else {
      attention += 0.02 * (dtMs/16.6); // slight natural recovery when clear
    }
    attention = Math.max(0, Math.min(100, attention));
  }

  // ---- Obstacles ----
  function spawnObstacle(){
    const lane = Math.floor(Math.random()*LANES);
    const kind = Math.random();
    let w=44,h=70,color='#d64545';
    if(kind<0.5){ color = ['#e05252','#4d7fe0','#e0c94d','#8a52e0','#4ecf8f'][Math.floor(Math.random()*5)]; }
    else { color = '#e8e8e8'; w=36;h=36; } // pedestrian-ish cone/obstacle
    obstacles.push({
      lane, x:laneX[lane], y:-h-10, w, h, color, passed:false
    });
  }

  function crash(reason){
    if(ending) return;
    ending = true;
    running = false;
    flashEl.style.transition='opacity .05s';
    flashEl.style.opacity='0.9';
    setTimeout(()=>{
      flashEl.style.transition='opacity .6s';
      flashEl.style.opacity='0';
    },80);
    setTimeout(()=>showGameOver(reason), 500);
  }

  // ---- Drawing ----
  function drawRoad(){
    ctx.clearRect(0,0,W,H);
    // sky/background gradient already via CSS; draw asphalt
    ctx.fillStyle = '#26282f';
    ctx.fillRect(0,0,W,H);
    // side shoulders
    ctx.fillStyle = '#1c1e24';
    ctx.fillRect(0,0,W*0.03,H);
    ctx.fillRect(W*0.97,0,W*0.03,H);

    // lane dashed lines
    ctx.strokeStyle = 'rgba(232,232,232,0.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([28,26]);
    for(let i=1;i<LANES;i++){
      const x = laneWidth*i;
      ctx.beginPath();
      ctx.moveTo(x, -30 + (roadOffset % 54));
      ctx.lineTo(x, H+30);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function shadeColor(hex, percent){
    const num = parseInt(hex.replace('#',''),16);
    let r = (num>>16) + Math.round(255*percent);
    let g = ((num>>8)&0x00FF) + Math.round(255*percent);
    let b = (num&0x0000FF) + Math.round(255*percent);
    r = Math.max(0,Math.min(255,r));
    g = Math.max(0,Math.min(255,g));
    b = Math.max(0,Math.min(255,b));
    return `rgb(${r},${g},${b})`;
  }

  function drawWheel(cx, cy, ww, wh){
    ctx.save();
    ctx.translate(cx, cy);
    // tire
    ctx.fillStyle = '#0c0d0f';
    roundRect(ctx, -ww/2, -wh/2, ww, wh, ww*0.4);
    ctx.fill();
    // rim
    ctx.fillStyle = '#8b8f99';
    ctx.beginPath();
    ctx.ellipse(0, 0, ww*0.28, wh*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#c9ccd4';
    ctx.beginPath();
    ctx.ellipse(0, 0, ww*0.13, wh*0.1, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawCarShape(x,y,w,h,color,isPlayer){
    ctx.save();
    ctx.translate(x,y);

    // soft ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.58, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    // wheels (drawn first so body overlaps them slightly)
    const wheelW = w*0.2, wheelH = h*0.24;
    drawWheel(-w/2+wheelW*0.15, -h*0.26, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.15, -h*0.26, wheelW, wheelH);
    drawWheel(-w/2+wheelW*0.15,  h*0.12, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.15,  h*0.12, wheelW, wheelH);

    // body silhouette: slightly tapered toward the front for a sportier look
    const frontTaper = w*0.09; // narrower at the top (front)
    ctx.beginPath();
    ctx.moveTo(-w/2+frontTaper, -h/2);
    ctx.lineTo(w/2-frontTaper, -h/2);
    ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2+h*0.18);
    ctx.lineTo(w/2, h/2-h*0.16);
    ctx.quadraticCurveTo(w/2, h/2, w/2-w*0.06, h/2);
    ctx.lineTo(-w/2+w*0.06, h/2);
    ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2-h*0.16);
    ctx.lineTo(-w/2, -h/2+h*0.18);
    ctx.quadraticCurveTo(-w/2, -h/2, -w/2+frontTaper, -h/2);
    ctx.closePath();

    const grad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    grad.addColorStop(0, shadeColor(color,0.32));
    grad.addColorStop(0.32, shadeColor(color,0.08));
    grad.addColorStop(0.65, color);
    grad.addColorStop(1, shadeColor(color,-0.28));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = shadeColor(color,-0.4);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // top gloss highlight streak
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-w*0.16, -h*0.3, w*0.5, h*0.18, -0.25, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // side mirrors
    ctx.fillStyle = shadeColor(color,-0.15);
    roundRect(ctx, -w/2-w*0.07, -h*0.06, w*0.09, h*0.09, 2); ctx.fill();
    roundRect(ctx, w/2-w*0.02, -h*0.06, w*0.09, h*0.09, 2); ctx.fill();

    // roof / cabin
    const roofW = w*0.66, roofH = h*0.42;
    const roofY = (isPlayer? -h*0.06 : h*0.02);
    const roofGrad = ctx.createLinearGradient(0, roofY-roofH/2, 0, roofY+roofH/2);
    roofGrad.addColorStop(0, shadeColor(color,-0.1));
    roofGrad.addColorStop(1, shadeColor(color,-0.34));
    ctx.fillStyle = roofGrad;
    roundRect(ctx, -roofW/2, roofY-roofH/2, roofW, roofH, roofW*0.32);
    ctx.fill();

    // windshield(s) with glassy gradient + reflection
    const glassGrad = ctx.createLinearGradient(0,-h/2,0,h/2);
    glassGrad.addColorStop(0,'rgba(220,240,255,0.92)');
    glassGrad.addColorStop(1,'rgba(120,165,210,0.6)');
    ctx.fillStyle = glassGrad;
    let glassX, glassY, glassW, glassH, rearX, rearY, rearW, rearH;
    if(isPlayer){
      glassX=-w/2+7; glassY=-h/2+9; glassW=w-14; glassH=h*0.26;
      rearX=-w/2+9; rearY=h*0.10; rearW=w-18; rearH=h*0.14;
    } else {
      glassX=-w/2+7; glassY=h/2-h*0.35; glassW=w-14; glassH=h*0.24;
      rearX=-w/2+9; rearY=-h*0.26; rearW=w-18; rearH=h*0.14;
    }
    roundRect(ctx, glassX, glassY, glassW, glassH, 6); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.35)';
    roundRect(ctx, glassX+glassW*0.08, glassY+glassH*0.12, glassW*0.28, glassH*0.35, 3); ctx.fill();
    ctx.fillStyle = glassGrad;
    roundRect(ctx, rearX, rearY, rearW, rearH, 5); ctx.fill();

    // lights
    const headColor = isPlayer ? '#fff6cf' : '#ff5a5a';
    const tailColor = isPlayer ? '#ff5a5a' : '#fff6cf';
    ctx.fillStyle = headColor;
    roundRect(ctx, -w/2+3, -h/2+2, w*0.2, h*0.055, 3); ctx.fill();
    roundRect(ctx, w/2-w*0.23, -h/2+2, w*0.2, h*0.055, 3); ctx.fill();
    ctx.fillStyle = tailColor;
    roundRect(ctx, -w/2+4, h/2-h*0.07, w*0.16, h*0.045, 2); ctx.fill();
    roundRect(ctx, w/2-w*0.2, h/2-h*0.07, w*0.16, h*0.045, 2); ctx.fill();

    // center racing stripe + rear spoiler for the player's car
    if(isPlayer){
      ctx.fillStyle='rgba(255,255,255,0.4)';
      roundRect(ctx, -w*0.055, -h/2+4, w*0.11, h-8, 4);
      ctx.fill();
      ctx.fillStyle = shadeColor(color,-0.3);
      roundRect(ctx, -w/2+2, h/2-2, w-4, h*0.045, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // ---- Cybertruck-style player vehicle (angular, stainless-steel look) ----
  function drawCybertruck(x,y,w,h){
    ctx.save();
    ctx.translate(x,y);

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.6, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    // wheels — chunky, slightly wider stance
    const wheelW = w*0.22, wheelH = h*0.25;
    drawWheel(-w/2+wheelW*0.1, -h*0.27, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.1, -h*0.27, wheelW, wheelH);
    drawWheel(-w/2+wheelW*0.1,  h*0.14, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.1,  h*0.14, wheelW, wheelH);

    // angular stainless-steel body — sharp faceted panels, no curves
    ctx.beginPath();
    ctx.moveTo(-w*0.30, -h/2);
    ctx.lineTo( w*0.30, -h/2);
    ctx.lineTo( w/2,    -h*0.30);
    ctx.lineTo( w/2,     h*0.36);
    ctx.lineTo( w*0.40,  h/2);
    ctx.lineTo(-w*0.40,  h/2);
    ctx.lineTo(-w/2,     h*0.36);
    ctx.lineTo(-w/2,    -h*0.30);
    ctx.closePath();

    const steelGrad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    steelGrad.addColorStop(0,   '#eef0f3');
    steelGrad.addColorStop(0.35,'#c7cad2');
    steelGrad.addColorStop(0.6, '#9a9da6');
    steelGrad.addColorStop(1,   '#6f7178');
    ctx.fillStyle = steelGrad;
    ctx.fill();
    ctx.strokeStyle = '#4c4e54';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // faceted highlight (single flat plane of light, not a soft glow)
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(-w*0.28,-h/2);
    ctx.lineTo(-w*0.06,-h/2);
    ctx.lineTo(-w*0.16, h/2);
    ctx.lineTo(-w*0.38, h/2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // central dorsal crease — the signature fold line
    ctx.strokeStyle = 'rgba(60,62,68,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0,-h/2+3);
    ctx.lineTo(0, h/2-3);
    ctx.stroke();

    // full-width LED light bar (front)
    ctx.fillStyle = '#eafcff';
    roundRect(ctx, -w*0.32, -h/2+4, w*0.64, h*0.03, 1.2);
    ctx.fill();
    // full-width tail light bar (rear)
    ctx.fillStyle = '#ff3b3b';
    roundRect(ctx, -w*0.36, h/2-h*0.06, w*0.72, h*0.03, 1.2);
    ctx.fill();

    // dark tinted glass cabin, angular trapezoid
    ctx.fillStyle = 'rgba(24,27,32,0.92)';
    ctx.beginPath();
    ctx.moveTo(-w*0.25, -h*0.28);
    ctx.lineTo( w*0.25, -h*0.28);
    ctx.lineTo( w*0.20,  h*0.02);
    ctx.lineTo(-w*0.20,  h*0.02);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(-w*0.2,-h*0.27);
    ctx.lineTo(-w*0.03,-h*0.27);
    ctx.lineTo(-w*0.1, h*0.0);
    ctx.lineTo(-w*0.2, h*0.0);
    ctx.closePath();
    ctx.fill();

    // flat cargo-bed line toward the rear
    ctx.strokeStyle = 'rgba(60,62,68,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w*0.42, h*0.14);
    ctx.lineTo( w*0.42, h*0.14);
    ctx.stroke();

    // side mirrors — small angular blocks
    ctx.fillStyle = '#7d7f86';
    ctx.fillRect(-w/2-w*0.06, -h*0.05, w*0.08, h*0.07);
    ctx.fillRect( w/2-w*0.02, -h*0.05, w*0.08, h*0.07);

    ctx.restore();
  }

  // ---- Ferrari-style skin: low, curvy red sports car ----
  // ---- Ferrari-style skin: low, curvy red sports car (based on reference photo) ----
  function drawFerrari(x,y,w,h){
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.58, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const wheelW = w*0.19, wheelH = h*0.23;
    drawWheel(-w/2+wheelW*0.12, -h*0.25, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.12, -h*0.25, wheelW, wheelH);
    drawWheel(-w/2+wheelW*0.12,  h*0.12, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.12,  h*0.12, wheelW, wheelH);

    // curvy low body
    ctx.beginPath();
    ctx.moveTo(-w*0.14, -h/2);
    ctx.quadraticCurveTo(0, -h/2-h*0.02, w*0.14, -h/2);
    ctx.quadraticCurveTo(w*0.46, -h*0.38, w/2, -h*0.05);
    ctx.quadraticCurveTo(w*0.5, h*0.3, w*0.34, h/2);
    ctx.lineTo(-w*0.34, h/2);
    ctx.quadraticCurveTo(-w*0.5, h*0.3, -w/2, -h*0.05);
    ctx.quadraticCurveTo(-w*0.46, -h*0.38, -w*0.14, -h/2);
    ctx.closePath();

    const FER_RED = '#e01522';
    const grad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    grad.addColorStop(0, '#ff5346');
    grad.addColorStop(0.45,FER_RED);
    grad.addColorStop(1, '#7d0a10');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#4a0508';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // gloss streak
    ctx.save(); ctx.clip();
    ctx.fillStyle='rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-w*0.1,-h*0.22,w*0.4,h*0.14,-0.3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // black central hood vent/stripe (the dark diamond seen head-on in the reference)
    ctx.fillStyle = 'rgba(10,10,12,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, -h/2+2);
    ctx.lineTo(w*0.07, -h*0.28);
    ctx.lineTo(0, -h*0.12);
    ctx.lineTo(-w*0.07, -h*0.28);
    ctx.closePath();
    ctx.fill();

    // side air intake slits
    ctx.fillStyle='rgba(0,0,0,0.35)';
    roundRect(ctx,-w/2+2,-h*0.02,w*0.1,h*0.14,3); ctx.fill();
    roundRect(ctx, w/2-w*0.12,-h*0.02,w*0.1,h*0.14,3); ctx.fill();

    // cabin
    const roofY = -h*0.05;
    ctx.fillStyle = shadeColor(FER_RED,-0.5);
    roundRect(ctx,-w*0.28, roofY-h*0.16, w*0.56, h*0.3, w*0.26); ctx.fill();

    // blue-tinted glass, like the reference's windshield
    const glassGrad = ctx.createLinearGradient(0,-h*0.34,0,-h*0.1);
    glassGrad.addColorStop(0,'rgba(150,205,245,0.95)');
    glassGrad.addColorStop(0.5,'rgba(60,140,215,0.9)');
    glassGrad.addColorStop(1,'rgba(30,90,160,0.85)');
    ctx.fillStyle = glassGrad;
    roundRect(ctx, -w*0.22, -h*0.34, w*0.44, h*0.24, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, -w*0.16, -h*0.32, w*0.12, h*0.08, 4); ctx.fill();

    // small oval headlight pods near the front corners (silver/white, like the reference)
    ctx.fillStyle = '#f2f3f5';
    ctx.beginPath(); ctx.ellipse(-w*0.24,-h*0.34,w*0.075,h*0.045,0.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( w*0.24,-h*0.34,w*0.075,h*0.045,-0.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#9aa0aa'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(-w*0.24,-h*0.34,w*0.075,h*0.045,0.5,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse( w*0.24,-h*0.34,w*0.075,h*0.045,-0.5,0,Math.PI*2); ctx.stroke();

    // black lower front lip with a small yellow plate accent (like the reference's front badge)
    ctx.fillStyle = 'rgba(10,10,12,0.85)';
    roundRect(ctx, -w*0.22, -h/2+1, w*0.44, h*0.035, 2); ctx.fill();
    ctx.fillStyle = '#f4d13a';
    roundRect(ctx, -w*0.05, -h/2+2, w*0.1, h*0.03, 1); ctx.fill();

    // taillights
    ctx.fillStyle = '#ff3b3b';
    roundRect(ctx, -w/2+6, h/2-h*0.07, w*0.16, h*0.045, 2); ctx.fill();
    roundRect(ctx, w/2-w*0.22, h/2-h*0.07, w*0.16, h*0.045, 2); ctx.fill();

    // thin rear spoiler lip
    ctx.fillStyle = shadeColor(FER_RED,-0.4);
    roundRect(ctx, -w*0.32, h/2-3, w*0.64, h*0.03, 2); ctx.fill();

    ctx.restore();
  }

  // ---- VW-Beetle-style skin: rounded, classic dome shape (based on reference photo) ----
  function drawBeetle(x,y,w,h){
    ctx.save();
    ctx.translate(x,y);

    const BUG_GOLD = '#e8b23a';

    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.44, w*0.55, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const wheelW = w*0.18, wheelH = h*0.22;
    drawWheel(-w/2+wheelW*0.2, -h*0.24, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.2, -h*0.24, wheelW, wheelH);
    drawWheel(-w/2+wheelW*0.2,  h*0.14, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.2,  h*0.14, wheelW, wheelH);

    // rounded dome silhouette
    ctx.beginPath();
    ctx.ellipse(0, -h*0.02, w*0.5, h*0.5, 0, 0, Math.PI*2);

    // warm gold-to-amber shading, like the sun-faded paint in the reference
    const grad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    grad.addColorStop(0, '#f7d768');
    grad.addColorStop(0.45,BUG_GOLD);
    grad.addColorStop(1, '#a5651f');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = shadeColor(BUG_GOLD,-0.55);
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // chrome bumpers
    ctx.fillStyle = '#d9dce2';
    roundRect(ctx, -w*0.36, -h/2+2, w*0.72, h*0.05, 3); ctx.fill();
    roundRect(ctx, -w*0.36, h/2-h*0.07, w*0.72, h*0.05, 3); ctx.fill();

    // chrome side trim line, like the bright strip along the reference's rocker panel
    ctx.fillStyle = 'rgba(230,232,236,0.85)';
    roundRect(ctx, -w*0.46, -h*0.02, w*0.92, h*0.025, 2); ctx.fill();

    // gloss highlight
    ctx.save(); ctx.clip();
    ctx.fillStyle='rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(-w*0.14,-h*0.24,w*0.32,h*0.16,-0.3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // rounded windshield / rear window, lavender tint like the reference glass
    const glassGrad = ctx.createLinearGradient(0,-h/2,0,h/2);
    glassGrad.addColorStop(0,'rgba(200,195,235,0.95)');
    glassGrad.addColorStop(1,'rgba(120,110,175,0.7)');
    ctx.fillStyle = glassGrad;
    roundRect(ctx, -w*0.28, -h*0.3, w*0.56, h*0.26, w*0.24); ctx.fill();
    roundRect(ctx, -w*0.26, h*0.06, w*0.52, h*0.2, w*0.2); ctx.fill();
    // glass reflection swoosh
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    roundRect(ctx, -w*0.2, -h*0.28, w*0.09, h*0.14, 4); ctx.fill();

    // round chrome-rimmed headlights
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath(); ctx.arc(-w*0.32, -h*0.4, w*0.07, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( w*0.32, -h*0.4, w*0.07, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#8a8f97'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(-w*0.32, -h*0.4, w*0.07, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc( w*0.32, -h*0.4, w*0.07, 0, Math.PI*2); ctx.stroke();
    // round taillights
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.arc(-w*0.3, h*0.42, w*0.055, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( w*0.3, h*0.42, w*0.055, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }

  // ---- Import-tuner-style skin: wide stance, big rear wing (Supra vibe) ----
  function drawSupra(x,y,w,h){
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.6, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const wheelW = w*0.21, wheelH = h*0.25;
    drawWheel(-w/2+wheelW*0.08, -h*0.25, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.08, -h*0.25, wheelW, wheelH);
    drawWheel(-w/2+wheelW*0.08,  h*0.13, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.08,  h*0.13, wheelW, wheelH);

    // wide sporty body
    ctx.beginPath();
    ctx.moveTo(-w*0.18, -h/2);
    ctx.quadraticCurveTo(0,-h/2-h*0.01, w*0.18, -h/2);
    ctx.lineTo(w/2-w*0.04, -h*0.3);
    ctx.lineTo(w/2, h*0.1);
    ctx.quadraticCurveTo(w/2, h*0.42, w*0.36, h/2);
    ctx.lineTo(-w*0.36, h/2);
    ctx.quadraticCurveTo(-w/2, h*0.42, -w/2, h*0.1);
    ctx.lineTo(-w/2+w*0.04, -h*0.3);
    ctx.closePath();

    const grad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    grad.addColorStop(0, '#ffb04d');
    grad.addColorStop(0.5,'#ff8a00');
    grad.addColorStop(1, '#9a5000');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#5c3200';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // black hood stripe
    ctx.fillStyle='rgba(15,15,18,0.85)';
    roundRect(ctx, -w*0.09, -h/2+2, w*0.18, h*0.36, 3); ctx.fill();

    // gloss
    ctx.save(); ctx.clip();
    ctx.fillStyle='rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-w*0.18,-h*0.28,w*0.42,h*0.14,-0.3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // cabin
    ctx.fillStyle = shadeColor('#ff8a00',-0.55);
    roundRect(ctx,-w*0.26,-h*0.18,w*0.52,h*0.28,w*0.2); ctx.fill();
    const glassGrad = ctx.createLinearGradient(0,-h/2,0,h/2);
    glassGrad.addColorStop(0,'rgba(210,235,255,0.9)');
    glassGrad.addColorStop(1,'rgba(120,165,210,0.55)');
    ctx.fillStyle = glassGrad;
    roundRect(ctx, -w*0.21, -h*0.32, w*0.42, h*0.2, 6); ctx.fill();

    // headlights / taillights
    ctx.fillStyle = '#fff6cf';
    roundRect(ctx, -w/2+3, -h/2+2, w*0.2, h*0.05, 3); ctx.fill();
    roundRect(ctx, w/2-w*0.23, -h/2+2, w*0.2, h*0.05, 3); ctx.fill();
    ctx.fillStyle = '#ff2b2b';
    roundRect(ctx, -w/2+3, h/2-h*0.08, w*0.2, h*0.05, 2); ctx.fill();
    roundRect(ctx, w/2-w*0.23, h/2-h*0.08, w*0.2, h*0.05, 2); ctx.fill();

    // big rear wing (two posts + wing plane) — classic tuner silhouette
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(-w*0.26, h/2-h*0.2, w*0.03, h*0.16);
    ctx.fillRect( w*0.23, h/2-h*0.2, w*0.03, h*0.16);
    roundRect(ctx, -w*0.34, h/2-h*0.24, w*0.68, h*0.06, 2); ctx.fill();

    ctx.restore();
  }

  // ---- Stealth "bat"-inspired skin: matte black armored car with fin silhouette ----
  function drawBatimovil(x,y,w,h){
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.62, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const wheelW = w*0.22, wheelH = h*0.26;
    drawWheel(-w/2+wheelW*0.1, -h*0.26, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.1, -h*0.26, wheelW, wheelH);
    drawWheel(-w/2+wheelW*0.1,  h*0.15, wheelW, wheelH);
    drawWheel( w/2-wheelW*0.1,  h*0.15, wheelW, wheelH);

    // low angular armored body
    ctx.beginPath();
    ctx.moveTo(-w*0.2, -h/2);
    ctx.lineTo( w*0.2, -h/2);
    ctx.lineTo( w*0.34, -h*0.22);
    ctx.lineTo( w*0.4,  h*0.1);
    ctx.lineTo( w*0.3,  h*0.36);
    ctx.lineTo( w*0.46,  h/2);      // right fin flare
    ctx.lineTo( w*0.14,  h/2-2);
    ctx.lineTo(-w*0.14,  h/2-2);
    ctx.lineTo(-w*0.46,  h/2);      // left fin flare
    ctx.lineTo(-w*0.3,   h*0.36);
    ctx.lineTo(-w*0.4,   h*0.1);
    ctx.lineTo(-w*0.34,  -h*0.22);
    ctx.closePath();

    const grad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    grad.addColorStop(0, '#3a3c42');
    grad.addColorStop(0.5,'#1a1b1f');
    grad.addColorStop(1, '#050506');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // faint panel highlight
    ctx.save(); ctx.clip();
    ctx.fillStyle='rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(-w*0.1,-h*0.26,w*0.4,h*0.14,-0.3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // dorsal crease
    ctx.strokeStyle='rgba(255,60,60,0.35)';
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,-h/2+4); ctx.lineTo(0,h/2-4); ctx.stroke();

    // cockpit glass (tinted, narrow)
    ctx.fillStyle = 'rgba(10,10,14,0.95)';
    ctx.beginPath();
    ctx.moveTo(-w*0.16, -h*0.3);
    ctx.lineTo(w*0.16, -h*0.3);
    ctx.lineTo(w*0.11, h*0.0);
    ctx.lineTo(-w*0.11, h*0.0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle='rgba(255,60,60,0.5)';
    ctx.lineWidth=1;
    ctx.stroke();

    // thin red running lights front & back (subtle, no symbols)
    ctx.fillStyle = '#ff2b2b';
    roundRect(ctx, -w*0.22, -h/2+4, w*0.44, h*0.02, 1); ctx.fill();
    roundRect(ctx, -w*0.3, h/2-h*0.05, w*0.6, h*0.02, 1); ctx.fill();

    // twin rear exhaust circles
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-w*0.14, h/2-3, w*0.045, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( w*0.14, h/2-3, w*0.045, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3a3c42'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(-w*0.14, h/2-3, w*0.045, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc( w*0.14, h/2-3, w*0.045, 0, Math.PI*2); ctx.stroke();

    ctx.restore();
  }

  // ---- Sprite-based Supra skin ----
  function drawSupraSprite(x,y,w,h){
    if(!supraReady){ drawSupra(x,y,w,h); return; } // fallback while the image loads
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.6, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    // fit the sprite inside the (w,h) box while preserving its own aspect ratio
    const iw = supraImg.naturalWidth || supraImg.width;
    const ih = supraImg.naturalHeight || supraImg.height;
    const scale = Math.max(w/iw, h/ih) * 1.28; // slightly oversized so it reads well among the boxier cars
    const dw = iw*scale, dh = ih*scale;
    ctx.drawImage(supraImg, -dw/2, -dh/2, dw, dh);

    ctx.restore();
  }

  // ---- Sprite-based Ferrari skin (matches the reference image directly) ----
  function drawFerrariSprite(x,y,w,h){
    if(!ferrariReady){ drawFerrari(x,y,w,h); return; } // fallback while the image loads
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.58, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const iw = ferrariImg.naturalWidth || ferrariImg.width;
    const ih = ferrariImg.naturalHeight || ferrariImg.height;
    const scale = Math.max(w/iw, h/ih) * 1.55;
    const dw = iw*scale, dh = ih*scale;
    ctx.drawImage(ferrariImg, -dw/2, -dh/2, dw, dh);

    ctx.restore();
  }

  // ---- Sprite-based Beetle skin (user-provided artwork) ----
  function drawBeetleSprite(x,y,w,h){
    if(!beetleReady){ drawBeetle(x,y,w,h); return; } // fallback while the image loads
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.44, w*0.55, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const iw = beetleImg.naturalWidth || beetleImg.width;
    const ih = beetleImg.naturalHeight || beetleImg.height;
    const scale = Math.max(w/iw, h/ih) * 1.22;
    const dw = iw*scale, dh = ih*scale;
    ctx.drawImage(beetleImg, -dw/2, -dh/2, dw, dh);

    ctx.restore();
  }

  // ---- Sprite-based Batimovil skin (user-provided artwork) ----
  function drawBatimovilSprite(x,y,w,h){
    if(!batimovilReady){ drawBatimovil(x,y,w,h); return; } // fallback while the image loads
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.62, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const iw = batimovilImg.naturalWidth || batimovilImg.width;
    const ih = batimovilImg.naturalHeight || batimovilImg.height;
    const scale = Math.max(w/iw, h/ih) * 1.22;
    const dw = iw*scale, dh = ih*scale;
    ctx.drawImage(batimovilImg, -dw/2, -dh/2, dw, dh);

    ctx.restore();
  }

  // ---- Sprite-based Cybertruck skin (user-provided artwork) ----
  function drawCybertruckSprite(x,y,w,h){
    if(!cyberReady){ drawCybertruck(x,y,w,h); return; } // fallback while the image loads
    ctx.save();
    ctx.translate(x,y);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, h*0.46, w*0.6, h*0.13, 0, 0, Math.PI*2);
    ctx.fill();

    const iw = cyberImg.naturalWidth || cyberImg.width;
    const ih = cyberImg.naturalHeight || cyberImg.height;
    const scale = Math.max(w/iw, h/ih) * 1.22;
    const dw = iw*scale, dh = ih*scale;
    ctx.drawImage(cyberImg, -dw/2, -dh/2, dw, dh);

    ctx.restore();
  }

  function drawPlayerCar(x,y,w,h){
    switch(selectedSkin){
      case 'ferrari':   drawFerrariSprite(x,y,w,h); break;
      case 'beetle':    drawBeetleSprite(x,y,w,h); break;
      case 'supra':     drawSupraSprite(x,y,w,h); break;
      case 'batimovil': drawBatimovilSprite(x,y,w,h); break;
      case 'cybertruck':
      default:          drawCybertruckSprite(x,y,w,h);
    }
  }

  function drawPedestrianCone(x,y,w,h,color){
    ctx.save();
    ctx.translate(x,y);

    // ground shadow
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0,h*0.46,w*0.5,h*0.13,0,0,Math.PI*2);
    ctx.fill();

    // base
    ctx.fillStyle = '#1c1e24';
    roundRect(ctx, -w*0.42, h*0.36, w*0.84, h*0.14, 3);
    ctx.fill();

    // cone body with gradient
    const grad = ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
    grad.addColorStop(0,'#ff8a4c');
    grad.addColorStop(0.55,'#ff6a1f');
    grad.addColorStop(1,'#e0530f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0,-h/2);
    ctx.lineTo(w*0.42, h*0.38);
    ctx.lineTo(-w*0.42, h*0.38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle='#a83e0a';
    ctx.lineWidth=1.2;
    ctx.stroke();

    // reflective stripes
    ctx.fillStyle='#fff4dc';
    [[-0.05,0.06],[0.12,0.18]].forEach(([topFrac,botFrac])=>{
      const yTop = -h/2 + h*(0.5+topFrac);
      const yBot = -h/2 + h*(0.5+botFrac);
      const halfTop = (w*0.42) * ((yTop - (-h/2)) / (h*0.88));
      const halfBot = (w*0.42) * ((yBot - (-h/2)) / (h*0.88));
      ctx.beginPath();
      ctx.moveTo(-halfTop, yTop);
      ctx.lineTo(halfTop, yTop);
      ctx.lineTo(halfBot, yBot);
      ctx.lineTo(-halfBot, yBot);
      ctx.closePath();
      ctx.fill();
    });

    // highlight
    ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(-w*0.05,-h/2+2);
    ctx.lineTo(w*0.02, h*0.3);
    ctx.lineTo(-w*0.12, h*0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ---- Main loop ----
  let lastTime = null;
  function loop(ts){
    if(!running){ return; }
    if(lastTime===null) lastTime = ts;
    const dt = ts - lastTime;
    lastTime = ts;
    elapsed += dt;

    // difficulty scaling
    speed = baseSpeed + Math.min(4.5, elapsed/9000);
    distance += speed * (dt/16.6) * 0.6;

    roadOffset += speed*(dt/16.6);

    // smooth lane movement
    player.x += (player.targetX - player.x) * Math.min(1, dt/90);

    // spawn obstacles
    spawnObstacleTimer -= dt;
    const obstacleInterval = Math.max(420, 1150 - elapsed/40);
    if(spawnObstacleTimer<=0){
      spawnObstacle();
      spawnObstacleTimer = obstacleInterval * (0.7+Math.random()*0.6);
    }

    // spawn notifications
    spawnNotifTimer -= dt;
    const notifInterval = Math.max(1600, 3600 - elapsed/25);
    if(spawnNotifTimer<=0 && notifications.length < 5){
      spawnNotification();
      spawnNotifTimer = notifInterval * (0.7+Math.random()*0.6);
    }

    // move obstacles
    obstacles.forEach(o=>{ o.y += speed*(dt/16.6)*1.6; });
    obstacles = obstacles.filter(o=> o.y < H+80);

    // collision check
    for(const o of obstacles){
      if(o.y + o.h/2 > player.y - player.h/2 && o.y - o.h/2 < player.y + player.h/2){
        if(Math.abs(o.x - player.x) < (o.w/2 + player.w/2 - 8)){
          crash('choque');
          break;
        }
      }
    }

    updateNotifications(dt);
    if(attention<=0){
      crash('distraccion');
    }

    // visual feedback of distraction
    const blur = (100-attention)/100 * 4.5;
    canvas.style.filter = blur>0.1 ? `blur(${blur}px) brightness(${1 - (100-attention)/100*0.35})` : 'none';
    const vig = (100-attention)/100;
    vignette.style.boxShadow = `inset 0 0 ${60+vig*120}px ${10+vig*40}px rgba(180,0,0,${vig*0.55})`;

    updateHUD();

    drawRoad();
    obstacles.forEach(o=>{
      if(o.h===36 && o.w===36){ drawPedestrianCone(o.x,o.y,o.w,o.h,o.color); }
      else { drawCarShape(o.x,o.y,o.w,o.h,o.color,false); }
    });
    drawPlayerCar(player.x, player.y, player.w, player.h);
    pixelateFrame();

    if(running) requestAnimationFrame(loop);
  }

  // ---- Señalamientos viales (sección informativa) ----
  const svgWrap = (inner)=>`<svg viewBox="0 0 48 48" width="58" height="58" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${inner}</svg>`;
  const circRed = (inner)=>`<circle cx="24" cy="24" r="20" fill="#fff" stroke="#d62828" stroke-width="5"/>${inner}`;
  const diamond = (inner, fill='#ffc928')=>`<polygon points="24,2 46,24 24,46 2,24" fill="${fill}" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>${inner}`;
  const blueSq = (inner)=>`<rect x="3" y="3" width="42" height="42" rx="6" fill="#1565c0" stroke="#fff" stroke-width="2"/>${inner}`;
  const person = (tx,ty,s=1)=>`<g transform="translate(${tx} ${ty}) scale(${s})" stroke="#111" stroke-width="2.4" stroke-linecap="round" fill="none"><circle cx="0" cy="-10" r="3" fill="#111"/><path d="M0 -6 V5 M0 5 L-5 13 M0 5 L5 13 M0 -3 L-6 2 M0 -3 L6 0"/></g>`;
  const lightIcon = (on)=>{
    const cols = ['#e63946','#ffb703','#2ecc71'];
    const circles = cols.map((c,i)=>`<circle cx="24" cy="${11+i*13}" r="5.5" fill="${i===on?c:'#3a3d45'}"/>`).join('');
    return svgWrap(`<rect x="14" y="2" width="20" height="44" rx="6" fill="#111" stroke="#555" stroke-width="1.5"/>${circles}`);
  };
  const roadBg = `<rect x="2" y="6" width="44" height="36" rx="3" fill="#3a3d45"/>`;

  const SIGN_SECTIONS = [
    {
      title:'Restrictivas', color:'#ff6b6b',
      desc:'Borde rojo: indican una prohibición u obligación que debes cumplir.',
      items:[
        {name:'Alto', meaning:'Detén por completo tu vehículo antes de la línea de alto y avanza solo cuando el cruce esté libre.',
         svg:svgWrap(`<polygon points="15,3 33,3 45,15 45,33 33,45 15,45 3,33 3,15" fill="#d62828" stroke="#fff" stroke-width="2"/><text x="24" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="11" fill="#fff">ALTO</text>`)},
        {name:'Ceda el paso', meaning:'Reduce la velocidad y da preferencia a los vehículos de la vía principal.',
         svg:svgWrap(`<polygon points="24,43 4,7 44,7" fill="#fff" stroke="#d62828" stroke-width="6" stroke-linejoin="round"/>`)},
        {name:'Velocidad máxima', meaning:'Límite de velocidad permitido en ese tramo (km/h). Pasarlo aumenta la gravedad de un choque.',
         svg:svgWrap(circRed(`<text x="24" y="30" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="16" fill="#111">50</text>`))},
        {name:'Prohibido estacionarse', meaning:'No puedes dejar tu vehículo detenido en esta zona.',
         svg:svgWrap(circRed(`<text x="24" y="31" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="20" fill="#1565c0">E</text><line x1="11" y1="37" x2="37" y2="11" stroke="#d62828" stroke-width="4"/>`))},
        {name:'Prohibido rebasar', meaning:'No adelantes a otros vehículos: la visibilidad o el espacio no lo permiten.',
         svg:svgWrap(circRed(`<rect x="10" y="19" width="12" height="10" rx="3" fill="#d62828"/><rect x="26" y="19" width="12" height="10" rx="3" fill="#111"/><circle cx="14" cy="30" r="2" fill="#111"/><circle cx="30" cy="30" r="2" fill="#111"/>`))},
        {name:'Prohibida la vuelta en U', meaning:'No puedes dar vuelta en U para regresar en sentido contrario.',
         svg:svgWrap(circRed(`<path d="M18 34 V21 a6 6 0 0 1 12 0 V28" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round"/><polygon points="25,27 35,27 30,35" fill="#111"/><line x1="11" y1="37" x2="37" y2="11" stroke="#d62828" stroke-width="4"/>`))},
        {name:'Prohibido el paso', meaning:'Entrada prohibida: circular en ese sentido es contrasentido y puede causar choques de frente.',
         svg:svgWrap(`<circle cx="24" cy="24" r="21" fill="#d62828" stroke="#fff" stroke-width="2"/><rect x="10" y="20" width="28" height="8" rx="1" fill="#fff"/>`)}
      ]
    },
    {
      title:'Preventivas', color:'#ffc928',
      desc:'Rombo amarillo: te avisan de un peligro adelante para que reacciones a tiempo.',
      items:[
        {name:'Curva', meaning:'Se aproxima una curva. Reduce la velocidad antes de entrar y no rebases.',
         svg:svgWrap(diamond(`<path d="M19 36 C19 26 30 27 30 17" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round"/><polygon points="30,9 24,19 36,19" fill="#111"/>`))},
        {name:'Cruce de peatones', meaning:'Hay un paso peatonal adelante. Prepárate para frenar y cede siempre el paso.',
         svg:svgWrap(diamond(person(24,27,1.05)))},
        {name:'Zona escolar', meaning:'Cerca de una escuela: modera la velocidad, niñas y niños pueden cruzar.',
         svg:svgWrap(diamond(person(18,27,0.95)+person(31,31,0.65)))},
        {name:'Reductor de velocidad (tope)', meaning:'Frena con anticipación: tomarlo rápido puede hacerte perder el control.',
         svg:svgWrap(diamond(`<path d="M9 32 Q24 12 39 32 Z" fill="#111"/><line x1="8" y1="33" x2="40" y2="33" stroke="#111" stroke-width="2"/>`))},
        {name:'Pavimento resbaladizo', meaning:'Sobre todo con lluvia: aumenta la distancia de frenado y evita maniobras bruscas.',
         svg:svgWrap(diamond(`<rect x="15" y="12" width="18" height="13" rx="4" fill="#111"/><rect x="18" y="14" width="12" height="5" rx="1.5" fill="#ffc928"/><circle cx="19" cy="27" r="2.6" fill="#111"/><circle cx="29" cy="27" r="2.6" fill="#111"/><path d="M12 34 q3 -3 6 0 t6 0 t6 0 t6 0" fill="none" stroke="#111" stroke-width="2.2"/>`))},
        {name:'Semáforo adelante', meaning:'Hay un semáforo más adelante. Revisa la luz con tiempo y prepárate para frenar.',
         svg:svgWrap(diamond(`<rect x="19" y="9" width="10" height="30" rx="3" fill="#111"/><circle cx="24" cy="16" r="3" fill="#e63946"/><circle cx="24" cy="24" r="3" fill="#ffb703"/><circle cx="24" cy="32" r="3" fill="#2ecc71"/>`))},
        {name:'Cruce con ferrocarril', meaning:'Vías del tren adelante. Detente, mira y escucha: el tren no puede frenar a tiempo.',
         svg:svgWrap(diamond(`<line x1="14" y1="14" x2="34" y2="34" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="34" y1="14" x2="14" y2="34" stroke="#111" stroke-width="5" stroke-linecap="round"/>`))},
        {name:'Zona de obras', meaning:'Trabajos en la vía. Reduce la velocidad y respeta al personal y las indicaciones.',
         svg:svgWrap(diamond(`<rect x="9" y="19" width="30" height="8" fill="#fff" stroke="#111" stroke-width="1.6"/><path d="M16 19 l-4 8 M24 19 l-4 8 M32 19 l-4 8" stroke="#111" stroke-width="2.4"/><path d="M13 27 v9 M35 27 v9" stroke="#111" stroke-width="2.4"/>`, '#ff8c1a'))}
      ]
    },
    {
      title:'Informativas', color:'#5aa9ff',
      desc:'Fondo azul: te orientan sobre servicios y lugares útiles.',
      items:[
        {name:'Servicio médico', meaning:'Hay atención médica o primeros auxilios cerca.',
         svg:svgWrap(blueSq(`<rect x="20" y="10" width="8" height="28" fill="#fff"/><rect x="10" y="20" width="28" height="8" fill="#fff"/>`))},
        {name:'Estacionamiento', meaning:'Zona donde sí está permitido estacionarse.',
         svg:svgWrap(blueSq(`<text x="24" y="35" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="30" fill="#fff">E</text>`))},
        {name:'Gasolinera', meaning:'Servicio de combustible cercano. Carga con tiempo y no manejes con el tanque en reserva.',
         svg:svgWrap(blueSq(`<rect x="13" y="11" width="16" height="26" rx="2" fill="#fff"/><rect x="16" y="14" width="10" height="7" fill="#1565c0"/><path d="M29 18 h3 a3 3 0 0 1 3 3 v12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`))}
      ]
    },
    {
      title:'Semáforo', color:'#3ddc97',
      desc:'Las tres luces que debes obedecer siempre, con o sin policía a la vista.',
      items:[
        {name:'Luz roja', meaning:'Alto total. Detente antes de la línea y espera a que cambie.', svg:lightIcon(0)},
        {name:'Luz ámbar', meaning:'Precaución: va a cambiar a rojo. Prepárate para detenerte, no aceleres.', svg:lightIcon(1)},
        {name:'Luz verde', meaning:'Avanza con precaución, cediendo el paso a peatones y a quien ya esté en el cruce.', svg:lightIcon(2)}
      ]
    },
    {
      title:'Marcas en el pavimento', color:'#cfd3da',
      desc:'Lo que está pintado en la calle también es una señal.',
      items:[
        {name:'Paso peatonal (cebra)', meaning:'El peatón tiene preferencia. Detente antes de las franjas.',
         svg:svgWrap(roadBg+`<rect x="6" y="10" width="5" height="28" fill="#fff"/><rect x="14" y="10" width="5" height="28" fill="#fff"/><rect x="22" y="10" width="5" height="28" fill="#fff"/><rect x="30" y="10" width="5" height="28" fill="#fff"/><rect x="38" y="10" width="4" height="28" fill="#fff"/>`)},
        {name:'Doble línea amarilla continua', meaning:'Prohibido rebasar o cruzarla. Separa sentidos opuestos.',
         svg:svgWrap(roadBg+`<line x1="21" y1="6" x2="21" y2="42" stroke="#ffc928" stroke-width="3"/><line x1="27" y1="6" x2="27" y2="42" stroke="#ffc928" stroke-width="3"/>`)},
        {name:'Línea blanca discontinua', meaning:'Separa carriles del mismo sentido. Puedes cambiar de carril con precaución y direccional.',
         svg:svgWrap(roadBg+`<line x1="24" y1="8" x2="24" y2="40" stroke="#fff" stroke-width="3" stroke-dasharray="7 5"/>`)}
      ]
    }
  ];

  function signsHTML(){
    return SIGN_SECTIONS.map(sec=>`
      <div class="signSection">
        <h2 style="color:${sec.color}">${sec.title}</h2>
        <p class="secDesc">${sec.desc}</p>
        <div class="signGrid">
          ${sec.items.map(it=>`
            <div class="signCard">
              <div class="signIcon">${it.svg}</div>
              <span class="signName">${it.name}</span>
              <span class="signMeaning">${it.meaning}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  function showSigns(backFn){
    overlay.innerHTML = `
      <div class="signsWrap">
        <h1>Señalamientos <span>viales</span></h1>
        <p>Conocerlos salva vidas. Pero ninguna señal te protege si tus ojos están en el celular.</p>
        ${signsHTML()}
        <div id="factBox"><b>Recuerda:</b> un señalamiento solo sirve si lo ves a tiempo. Cada vez que miras la pantalla del celular dejas de ver el camino... y todas estas señales.</div>
        <button class="cta" id="signsBackBtn">Volver</button>
      </div>
    `;
    overlay.classList.add('scroll');
    overlay.classList.remove('hidden');
    overlay.scrollTop = 0;
    document.getElementById('signsBackBtn').addEventListener('click', backFn || showStartScreen);
  }

  function skinPickerHTML(){
    return `
      <div id="skinPicker">
        ${SKINS.map(s=>`
          <div class="skinCard${s.id===selectedSkin?' selected':''}" data-skin="${s.id}">
            <div class="swatch" style="background:${s.color};">${s.emoji}</div>
            <span class="name">${s.name}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function bindSkinPicker(){
    document.querySelectorAll('.skinCard').forEach(card=>{
      card.addEventListener('click', ()=>{
        selectedSkin = card.dataset.skin;
        document.querySelectorAll('.skinCard').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  function showStartScreen(){
    overlay.classList.remove('scroll');
    overlay.innerHTML = `
      <h1>Distracción <span>Fatal</span></h1>
      <p>Eres el conductor. Mientras avanzas por la carretera, tu celular no dejará de interrumpirte. Cierra las notificaciones a tiempo o perderás de vista el camino... y la vida de alguien.</p>
      <div class="rules">
        <li><b>Mueve el auto</b> con las flechas ◀ ▶ (o A / D) para esquivar obstáculos.</li>
        <li><b>Da clic</b> sobre cada notificación para cerrarla antes de que se acumulen.</li>
        <li>Si tu <b>atención al camino</b> llega a cero, perderás el control del auto.</li>
        <li>Chocar contra un obstáculo termina la partida al instante.</li>
      </div>
      <p style="margin-bottom:-4px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Elige tu auto</p>
      ${skinPickerHTML()}
      <button class="cta" id="startBtn">Empezar a manejar</button>
      <button class="ghost" id="signsBtn">Señalamientos viales</button>
    `;
    overlay.classList.remove('hidden');
    bindSkinPicker();
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('signsBtn').addEventListener('click', ()=>showSigns(showStartScreen));
  }

  function startGame(){
    overlay.classList.add('hidden');
    resize();
    reset();
    running = true;
    lastTime = null;
    canvas.style.filter='none';
    vignette.style.boxShadow='none';
    requestAnimationFrame(loop);
  }

  function showGameOver(reason){
    notifications.forEach(n=>n.el.remove());
    notifications = [];
    const title = reason==='choque' ? 'Chocaste 💥' : 'Perdiste el control 📵';
    const msg = reason==='choque'
      ? 'Un segundo de distracción bastó para no ver el obstáculo a tiempo.'
      : 'Tu atención se fue por completo al celular y dejaste de ver la carretera.';

    overlay.classList.remove('scroll');
    overlay.innerHTML = `
      <h1>${title}</h1>
      <p>${msg}</p>
      <div class="rules" style="text-align:center;">
        <div style="display:flex;justify-content:space-around;margin-bottom:8px;">
          <div><b style="font-size:20px;">${Math.floor(distance)} m</b><br><span style="color:var(--muted);font-size:11px;">recorridos</span></div>
          <div><b style="font-size:20px;">${clearedCount}</b><br><span style="color:var(--muted);font-size:11px;">distracciones cerradas</span></div>
        </div>
      </div>
      <div id="factBox"><b>Dato real:</b> según la OMS, usar el celular al conducir multiplica hasta <b>4 veces</b> el riesgo de sufrir un accidente. Mirar la pantalla solo 3 segundos a 40 km/h significa recorrer más de 30 metros sin ver el camino.</div>
      <button class="cta" id="retryBtn">Intentar de nuevo</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        <button class="ghost" id="changeSkinBtn">Cambiar de auto</button>
        <button class="ghost" id="infoBtn">¿Por qué este juego?</button>
        <button class="ghost" id="signsBtn">Señalamientos viales</button>
      </div>
    `;
    overlay.classList.remove('hidden');
    document.getElementById('retryBtn').addEventListener('click', startGame);
    document.getElementById('changeSkinBtn').addEventListener('click', showStartScreen);
    document.getElementById('infoBtn').addEventListener('click', showInfo);
    document.getElementById('signsBtn').addEventListener('click', ()=>showSigns(()=>showGameOver(reason)));
  }

  function showInfo(){
    overlay.classList.remove('scroll');
    overlay.innerHTML = `
      <h1>Sobre este juego</h1>
      <p style="text-align:left;">
        Cada notificación que aparecía en tu pantalla representa un mensaje, red social o llamada real que compite por tu atención mientras manejas. En la vida real no hay pausa ni reinicio: la Organización Mundial de la Salud señala que el uso del celular al volante afecta la atención visual, cognitiva y manual del conductor al mismo tiempo, aumentando drásticamente el riesgo de un choque fatal.<br><br>
        La próxima vez que manejes, deja el celular fuera de alcance, en silencio o en modo "No molestar mientras conduces". Ninguna notificación vale una vida.
      </p>
      <button class="cta" id="backBtn">Volver a jugar</button>
    `;
    document.getElementById('backBtn').addEventListener('click', startGame);
  }

  resize();
  setupLanes();
  showStartScreen();
})();
