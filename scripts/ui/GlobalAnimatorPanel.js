// scripts/ui/GlobalAnimatorPanel.js
import { TokenAnimationsApp } from "./TokenAnimationsApp.js";

const MODID = "token-animator";

function snapName(s) { return s?.trim() || ""; }

/* ---------- Persistência do estado de colapso por pasta (client) ---------- */
function getCollapsedMap() {
  try { return game.settings.get(MODID, "folderCollapsed") || {}; } catch { return {}; }
}
function setCollapsed(folder, val) {
  const key = folder || "__none__";
  const m = getCollapsedMap();
  m[key] = !!val;
  game.settings.set(MODID, "folderCollapsed", m).catch(()=>{});
}
function isCollapsed(folder) {
  const key = folder || "__none__";
  const m = getCollapsedMap();
  return !!m[key];
}
Hooks.once("init", () => {
  if (!game.settings.settings.has(`${MODID}.folderCollapsed`)) {
    game.settings.register(MODID, "folderCollapsed", {
      scope: "client", config: false, type: Object, default: {}
    });
  }
});

export class GlobalAnimatorPanel extends Application {
  static get defaultOptions() {
    // Altura numérica + resizable => permite redimensionar verticalmente
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "global-animator-panel",
      popOut: true,
      minimizable: true,
      resizable: true,
      title: "Global Animator",
      template: null,
      width: 760,
      height: 540, // mantém seu comportamento de ajustar altura/largura
      classes: ["token-animator-app", "global-animator"]
    });
  }

  // Mantém a janela com conteúdo rolável e respeitando a altura
  async _render(force=false, options={}) {
    await super._render(force, options);
    try {
      const el = this.element?.[0] ?? this.element;
      if (el) {
        const wc = el.querySelector(".window-content");
        if (wc) {
          wc.style.display = "flex";
          wc.style.flexDirection = "column";
          wc.style.padding = "8px";
          wc.style.overflow = "hidden"; // container
        }
        // wrapper do conteúdo para rolar dentro da altura da janela
        const inner = el.querySelector(".ga-inner");
        if (inner) {
          inner.style.minHeight = "0";
          inner.style.overflow = "auto";
          inner.style.flex = "1 1 auto";
        }
      }
    } catch (e) {
      console.warn(`[${MODID}] GlobalAnimatorPanel post-render style`, e);
    }
  }

  _collectAll() {
    const out = [];
    const scene = game.scenes?.current;
    if (!scene) return out;

    for (const td of scene.tokens.contents) {
      const token = canvas.tokens?.placeables?.find(t => t.id === td.id);
      const anims = td.getFlag(MODID, "anims") ?? [];
      anims.forEach((anim, idx) => {
        out.push({
          token, tokenId: td.id, tokenName: td.name,
          idx, anim
        });
      });
    }
    return out;
  }

  async _renderInner() {
    const wrap = document.createElement("div");
    wrap.className = "ga-inner"; // usado no _render para overflow auto

    const all = this._collectAll();
    // Agrupa por folder (string definida no item)
    const groups = new Map();
    for (const row of all) {
      const key = snapName(row.anim.folder);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    // Header
    const header = document.createElement("div");
    header.innerHTML = `
      <div class="ta-row" style="align-items:center; gap:8px;">
        <div class="ta-title">All Animations (${all.length})</div>
        <div class="ta-right" style="display:flex; gap:6px;">
          <button class="new-from-selection"><i class="fa-solid fa-plus"></i> New (from selection)</button>
        </div>
      </div>
      <div class="token-animator-hint">
        Use folders to organize animations. (Folder field is available per-item in the token panel too.)
      </div>
    `;
    wrap.appendChild(header);

    // Cada grupo (pasta) com play/pause/stop ALL e colapso persistente
    for (const [folder, items] of groups.entries()) {
      const collapsed = isCollapsed(folder);
      const sec = document.createElement("section");
      sec.className = "gap-section";

      sec.innerHTML = `
        <div class="ta-row group-header" data-folder="${foundry.utils.escapeHTML(folder || "")}" style="align-items:center; cursor:pointer;">
          <div class="group-title" style="display:flex; align-items:center; gap:8px;">
            <i class="fa-solid ${collapsed ? "fa-folder" : "fa-folder-open"}"></i>
            <span class="folder-name">${folder || "(No Folder)"}</span>
            <span class="muted count">— ${items.length}</span>
          </div>
          <div class="ta-right" style="display:flex; gap:6px;">
            <button class="play-all nowrap"><i class="fa-solid fa-play"></i> <span>Play all</span></button>
            <button class="pause-all nowrap"><i class="fa-solid fa-pause"></i> <span>Pause all</span></button>
            <button class="stop-all danger nowrap"><i class="fa-solid fa-stop"></i> <span>Stop all</span></button>
          </div>
        </div>
        <div class="anim-list" style="${collapsed ? "display:none" : ""}"></div>
      `;

      const list = sec.querySelector(".anim-list");

      for (const { token, tokenId, tokenName, idx, anim } of items) {
        const row = document.createElement("div");
        row.className = "anim-item";

        const sp = Number(anim.speed ?? 4) || 4;
        const snap = !!anim.snap;
        const folderVal = snapName(anim.folder);

        row.innerHTML = `
          <div class="left" style="min-width:180px;">
            <div><b>${foundry.utils.escapeHTML(anim.name ?? `Anim ${idx+1}`)}</b></div>
            <div class="muted">Token: ${foundry.utils.escapeHTML(tokenName ?? tokenId)}</div>
          </div>
          <label class="speed-wrap" title="Speed (grids/s)">
            <span>⚡</span>
            <input class="speed" type="number" min="0.5" step="0.5" value="${sp}" style="width:68px;">
          </label>
          <label class="chk" title="Snap to grid">
            <input class="snap" type="checkbox" ${snap ? "checked" : ""}/>
            Snap
          </label>
          <input class="folder" placeholder="Folder…" value="${foundry.utils.escapeHTML(folderVal)}" title="Folder"/>
          <div class="btns">
            <button class="play" title="Play / Resume"><i class="fa-solid fa-play"></i></button>
            <button class="pause" title="Pause"><i class="fa-solid fa-pause"></i></button>
            <button class="stop danger" title="Stop"><i class="fa-solid fa-stop"></i></button>
            <button class="open" title="Open token panel"><i class="fa-solid fa-up-right-from-square"></i></button>
            <button class="del danger" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;

        const speedEl  = row.querySelector(".speed");
        const snapEl   = row.querySelector(".snap");
        const folderEl = row.querySelector(".folder");

        const saveAnimPatch = async (patch) => {
          const doc = token?.document ?? canvas.scene.tokens.get(tokenId);
          if (!doc) return;
          const anims = foundry.utils.duplicate(doc.getFlag(MODID, "anims") ?? []);
          anims[idx] = { ...anims[idx], ...patch };
          await doc.setFlag(MODID, "anims", anims);
        };

        row.querySelector(".play").addEventListener("click", async () => {
          const sp2 = Number(speedEl.value) || 4;
          const sn2 = !!snapEl.checked;
          await saveAnimPatch({ speed: sp2, snap: sn2 });
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          const anims = td?.document.getFlag(MODID, "anims") ?? [];
          const animNow = anims[idx];
          game.modules.get(MODID)?.api?.play(td, animNow, { speed: sp2 });
        });

        row.querySelector(".pause").addEventListener("click", () => {
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          game.modules.get(MODID)?.api?.pause(td);
        });

        row.querySelector(".stop").addEventListener("click", () => {
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          game.modules.get(MODID)?.api?.stop(td);
        });

        row.querySelector(".open").addEventListener("click", () => {
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          new TokenAnimationsApp(td).render(true);
        });

        row.querySelector(".del").addEventListener("click", async () => {
          const doc = token?.document ?? canvas.scene.tokens.get(tokenId);
          if (!doc) return;
          const yes = await Dialog.confirm({
            title: "Remove animation",
            content: `<p>Remove <b>${foundry.utils.escapeHTML(anim.name)}</b>?</p>`
          });
          if (!yes) return;
          const anims = foundry.utils.duplicate(doc.getFlag(MODID, "anims") ?? []);
          anims.splice(idx, 1);
          await doc.setFlag(MODID, "anims", anims);
          this.render(true);
        });

        speedEl.addEventListener("change", async () => {
          const sp2 = Number(speedEl.value) || 4;
          await saveAnimPatch({ speed: sp2 });
        });

        snapEl.addEventListener("change", async () => {
          const sn2 = !!snapEl.checked;
          const doc = token?.document ?? canvas.scene.tokens.get(tokenId);
          if (!doc) return;
          const anims = foundry.utils.duplicate(doc.getFlag(MODID, "anims") ?? []);
          const pts = (anims[idx]?.points ?? []).map(p => p);
          anims[idx] = { ...anims[idx], snap: sn2, points: pts };
          await doc.setFlag(MODID, "anims", anims);
        });

        folderEl.addEventListener("change", async () => {
          await saveAnimPatch({ folder: snapName(folderEl.value) });
          this.render(true);
        });

        list.appendChild(row);
      }

      // expand / collapse da pasta (clique no header; ignora cliques nos botões à direita)
      const headerRow = sec.querySelector(".group-header");
      const listEl = sec.querySelector(".anim-list");
      headerRow.addEventListener("click", (ev) => {
        if (ev.target.closest(".ta-right")) return; // não colapsa ao clicar nos botões
        const currentlyVisible = listEl.style.display !== "none";
        listEl.style.display = currentlyVisible ? "none" : "";
        const icon = headerRow.querySelector(".fa-folder, .fa-folder-open");
        if (icon) {
          icon.classList.toggle("fa-folder-open", !currentlyVisible);
          icon.classList.toggle("fa-folder", currentlyVisible);
        }
        const folderName = headerRow.dataset.folder || "";
        setCollapsed(folderName, currentlyVisible); // se ficou escondido => collapsed = true
      });

      // Controles em massa (da pasta)
      sec.querySelector(".play-all").addEventListener("click", async () => {
        for (const { token, tokenId, idx } of items) {
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          const anims = td?.document.getFlag(MODID, "anims") ?? [];
          const animNow = anims[idx];
          if (animNow) game.modules.get(MODID)?.api?.play(td, animNow, { speed: animNow.speed ?? 4 });
        }
      });

      sec.querySelector(".pause-all").addEventListener("click", () => {
        for (const { token, tokenId } of items) {
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          game.modules.get(MODID)?.api?.pause(td);
        }
      });

      sec.querySelector(".stop-all").addEventListener("click", () => {
        for (const { token, tokenId } of items) {
          const td = token ?? canvas.tokens.placeables.find(t => t.id === tokenId);
          game.modules.get(MODID)?.api?.stop(td);
        }
      });

      wrap.appendChild(sec);
    }

    // New from selection
    header.querySelector(".new-from-selection").addEventListener("click", async () => {
      const td = canvas.tokens.controlled[0];
      if (!td) return ui.notifications.warn("Select a token first.");
      new TokenAnimationsApp(td).render(true);
    });

    return wrap;
  }
}
