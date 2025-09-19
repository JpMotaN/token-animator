// scripts/main.js
import { TokenAnimationsApp } from "./ui/TokenAnimationsApp.js";
import { GlobalAnimatorPanel } from "./ui/GlobalAnimatorPanel.js";

const MODID = "token-animator";

/** Controllers of the running animation per tokenId */
const controllers = new Map();

/** Promise gate helper */
function createGate() {
  let release;
  const p = new Promise(r => (release = r));
  return [p, release];
}

/** Make current controller interruptible (pause/stop) */
function makeInterruptible(ctrl) {
  const pausedWait = async () => {
    while (ctrl?.paused && !ctrl?.stopped) {
      if (!ctrl._pauseGate) ctrl._pauseGate = createGate();
      await ctrl._pauseGate[0];
    }
  };
  if (!ctrl._stopGate) ctrl._stopGate = createGate();
  const stopSignal = ctrl._stopGate[0];
  return { pausedWait, stopSignal };
}

/** Sleep helper (races with stop) */
function sleep(ms, stopSignal) {
  return Promise.race([
    new Promise(res => setTimeout(res, ms)),
    stopSignal
  ]).catch(() => {}); // evita unhandled caso stop resolva
}

/**
 * Animação “granular”:
 * - Passos pequenos (<= 1/8 do grid) e duração minúscula (12–24ms)
 * - Checagens frequentes de pause/stop/runKey
 * - RunKey invalida imediatamente loops antigos quando STOP é chamado
 */
async function runAnimation(token, anim, speedGrids, runKey) {
  const gridSize   = canvas.grid?.size || 100;
  const pxPerSec   = (speedGrids ?? 4) * gridSize;

  // passos curtos e duração mínima — para respostas “instantâneas”
  const stepPx     = Math.max(2, Math.floor(gridSize / 8)); // 1/8 do grid (ou 2px)
  const stepMsMin  = 12;
  const stepMsMax  = 24;

  const hw = token.w / 2, hh = token.h / 2;
  const toTokenXY = (pt) => ({ x: pt.x - hw, y: pt.y - hh });

  const ctrl = controllers.get(token.id);
  if (!ctrl || ctrl.runKey !== runKey) return;
  const { pausedWait, stopSignal } = makeInterruptible(ctrl);

  // percorre segmentos
  for (let i = 1; i < anim.points.length; i++) {
    if (!controllers.has(token.id)) break;
    if (ctrl.stopped || ctrl.runKey !== runKey) break;

    const a = anim.points[i - 1], b = anim.points[i];
    a.x ??= b.x; a.y ??= b.y; // robustez
    const dx = (b.x - a.x), dy = (b.y - a.y);
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / stepPx));

    for (let s = 1; s <= steps; s++) {
      if (!controllers.has(token.id)) break;
      if (ctrl.stopped || ctrl.runKey !== runKey) break;

      await pausedWait(); // pausa “quase instantânea”
      if (ctrl.stopped || ctrl.runKey !== runKey) break;

      const t = s / steps;
      const x = a.x + dx * t, y = a.y + dy * t;

      // duração alvo do passo (clamp curtíssimo)
      const targetMs = (stepPx / pxPerSec) * 1000;
      const duration = Math.max(stepMsMin, Math.min(stepMsMax, targetMs));

      // atualiza posição com animação curta
      try {
        await token.document.update(toTokenXY({ x, y }), { animate: true, animation: { duration } });
      } catch (e) {
        // se o token foi deletado/desanexado, aborta
        break;
      }

      // pequena espera (ou interrompe já se houve stop)
      await sleep(duration, stopSignal);
    }
  }
}

function buildRuntimeAPI() {
  return {
    async play(token, anim, { speed } = {}) {
      if (!token || !anim?.points?.length) return;

      const existing = controllers.get(token.id);
      // se estiver pausado, “resume”
      if (existing && existing.paused && !existing.stopped) {
        return this.resume(token);
      }

      // encerra qualquer execução vigente
      await this.stop(token);

      // cria novo controller com um runKey exclusivo
      const runKey = Symbol("run");
      const controller = {
        tokenId: token.id,
        paused: false,
        stopped: false,
        _pauseGate: null,
        _stopGate: null,
        startPoint: anim.points[0] ? { ...anim.points[0] } : null,
        runKey
      };
      controllers.set(token.id, controller);

      try {
        await runAnimation(token, anim, speed ?? anim.speed ?? 4, runKey);
      } finally {
        // se ainda somos o controller ativo, limpa
        const cur = controllers.get(token.id);
        if (cur && cur.runKey === runKey) controllers.delete(token.id);
      }
    },

    pause(token) {
      const c = controllers.get(token.id);
      if (!c || c.stopped) return;
      c.paused = true;
      // não resolvemos o pauseGate aqui — é resolvido no resume()
    },

    resume(token) {
      const c = controllers.get(token.id);
      if (!c || c.stopped) return;
      c.paused = false;
      if (c._pauseGate) {
        const [, release] = c._pauseGate;
        c._pauseGate = null;
        release(); // solta o loop imediatamente
      }
    },

    async stop(token) {
      const c = controllers.get(token.id);
      if (!c) return;

      // marca como parado e invalida o run atual
      c.stopped = true;
      c.runKey = Symbol("stopped");

      // libera gates para “destravar” qualquer await
      if (c._pauseGate) { const [, r] = c._pauseGate; c._pauseGate = null; try { r(); } catch {} }
      if (c._stopGate)  { const [, r] = c._stopGate;  c._stopGate  = null; try { r(); } catch {} }

      // reposiciona no ponto inicial (sem animar)
      if (c.startPoint) {
        const hw = token.w / 2, hh = token.h / 2;
        const x = c.startPoint.x - hw, y = c.startPoint.y - hh;
        try { await token.document.update({ x, y }, { animate: false }); } catch {}
      }

      // remove controller
      controllers.delete(token.id);
    },

    isPlaying(token) { return controllers.has(token.id); }
  };
}

Hooks.once("init", () => {
  game.modules.get(MODID).api = buildRuntimeAPI();

  // posição do botão global (client)
  game.settings.register(MODID, "globalButtonPos", {
    scope: "client", config: false, type: Object,
    default: { left: 16, bottom: 100 } // começa embaixo à esquerda
  });
});

Hooks.on("renderTokenHUD", (hud, html) => {
  const token = hud?.object;
  if (!token) return;

  const $root = (window.jQuery && html instanceof jQuery) ? html : (window.jQuery ? $(html) : null);
  let containerEl = null;
  if ($root) containerEl = $root.find(".col.right, .right, .left, .col.left").get(0) || null;
  else if (html instanceof HTMLElement) containerEl = html.querySelector(".col.right, .right, .left, .col.left");
  if (!containerEl) return;

  if ((containerEl.querySelector && containerEl.querySelector(".control-icon.token-animator"))
      || ($root && $root.find(".control-icon.token-animator").length)) return;

  const btn = document.createElement("div");
  btn.className = "control-icon token-animator";
  btn.title = "Token Animator";
  btn.innerHTML = `<i class="fas fa-film"></i>`;

  let opened = false;
  btn.addEventListener("click", () => {
    if (opened) return;
    opened = true;
    setTimeout(() => {
      try { new TokenAnimationsApp(token).render(true); }
      finally { setTimeout(() => (opened = false), 200); }
    }, 60);
  });

  containerEl.appendChild(btn);
});

Hooks.on("getSceneControlButtons", (controlsArg) => {
  const controls = Array.isArray(controlsArg)
    ? controlsArg
    : Array.isArray(controlsArg?.controls)
      ? controlsArg.controls
      : [];
  if (!controls.length) return;

  const tokenCtl = controls.find(c => c?.name === "token");
  if (!tokenCtl) return;

  if (!Array.isArray(tokenCtl.tools)) tokenCtl.tools = [];
  if (tokenCtl.tools.some(t => t?.name === "token-animator")) return;

  tokenCtl.tools.push({
    name: "token-animator",
    title: "Token Animator",
    icon: "fas fa-film",
    button: true,
    onClick: () => {
      const token = canvas.tokens.controlled[0];
      if (!token) return ui.notifications.warn("Select a token first.");
      new TokenAnimationsApp(token).render(true);
    }
  });
});

/** Botão global arrastável */
Hooks.on("ready", () => {
  const id = "ta-floating-global";
  let btn = document.getElementById(id);
  if (!btn) {
    btn = document.createElement("button");
    btn.id = id;
    btn.title = "Global Animator";
    btn.innerHTML = `<i class="fas fa-folder-open"></i>`;
    Object.assign(btn.style, {
      position: "fixed", left: "16px", bottom: "100px",
      width: "44px", height: "44px", borderRadius: "50%",
      // ↓↓↓ z-index baixo para FICAR SOB as janelas do Foundry
      zIndex: 20,
      border: "1px solid var(--color-border-light-primary)",
      background: "var(--color-border-light-highlight)",
      color: "var(--color-text-light-highlight)",
      boxShadow: "0 2px 8px rgba(0,0,0,.25)", cursor: "grab"
    });
    document.body.appendChild(btn);

    // aplicar posição salva
    const pos = game.settings.get(MODID, "globalButtonPos") || { left: 16, bottom: 100 };
    btn.style.left = `${pos.left}px`;
    btn.style.bottom = `${pos.bottom}px`;

    // drag manual
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startBottom = 0;
    const onDown = (ev) => {
      dragging = true; btn.style.cursor = "grabbing";
      startX = ev.clientX; startY = ev.clientY;
      startLeft = parseFloat(btn.style.left);
      startBottom = parseFloat(btn.style.bottom);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      btn.style.left = `${Math.max(0, startLeft + dx)}px`;
      btn.style.bottom = `${Math.max(0, startBottom - dy)}px`;
    };
    const onUp = () => {
      dragging = false; btn.style.cursor = "grab";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // salvar
      game.settings.set(MODID, "globalButtonPos", {
        left: parseFloat(btn.style.left),
        bottom: parseFloat(btn.style.bottom)
      }).catch(()=>{});
    };
    btn.addEventListener("pointerdown", onDown, { passive: true });
    // clique abre painel
    btn.addEventListener("click", (ev) => {
      if (dragging) return; // evita click após drag
      new GlobalAnimatorPanel().render(true);
    });
  }
});
