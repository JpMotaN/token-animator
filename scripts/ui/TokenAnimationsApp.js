// scripts/ui/TokenAnimationsApp.js
const MODID = "token-animator";

export class TokenAnimationsApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "token-animations-app",
      popOut: true,
      minimizable: true,
      title: "Token Animator",
      template: null,
      classes: ["token-animator-app"],
      width: 660,
      height: "auto",
      resizable: true
    });
  }

  constructor(token) {
    super();
    this.token = token;
    this.state = { defaultSpeed: 4, defaultSnap: true, editing: null };
    this.options.id = `token-animations-app-${token.id}`;
    this.options.title = `Token Animator – ${token.name ?? token.id}`;

    this._overlay = null;
  }

  /** Guard contra race do V1 framework */
  _activateCoreListeners(html) {
    try {
      if (!html || (!html[0] && !(html instanceof HTMLElement))) return;
      return super._activateCoreListeners?.(html);
    } catch (e) {
      console.warn("[token-animator] _activateCoreListeners guard", e);
    }
  }

  _getAnims() { return this.token?.document?.getFlag(MODID, "anims") ?? []; }

  async _setAnims(anims) {
    await this.token.document.setFlag(MODID, "anims", anims);
    setTimeout(() => { try { this.render(true); } catch {} }, 60);
  }

  _snapPoint({ x, y }, snapFlag) {
    if (!snapFlag) return { x, y };
    try {
      const grid = canvas.grid;
      if (typeof grid.getCenterPoint === "function") {
        const pt = grid.getCenterPoint({ x, y });
        return { x: pt.x, y: pt.y };
      }
      if (typeof grid.getCenter === "function") {
        const arr = grid.getCenter(x, y);
        return { x: arr[0], y: arr[1] };
      }
    } catch {}
    return { x, y };
  }

  _applySnapToArray(points, snapFlag) { return points.map(p => this._snapPoint(p, snapFlag)); }
  _maybeSnapped(points, snap) { return this._applySnapToArray(points, snap); }

  _fullHitAreaRect() {
    const d = canvas.dimensions;
    if (d) return new PIXI.Rectangle(0, 0, d.width, d.height);
    const r = canvas.app.renderer;
    return new PIXI.Rectangle(0, 0, r.screen.width, r.screen.height);
  }

  getData() {
    return {
      anims: this._getAnims(),
      defaultSpeed: this.state.defaultSpeed,
      defaultSnap: !!this.state.defaultSnap,
      editing: this.state.editing
    };
  }

  async _renderInner(data) {
    const wrap = document.createElement("div");

    const header = document.createElement("div");
    header.innerHTML = `
      <div class="ta-row">
        <button type="button" class="new-anim"><i class="fa-solid fa-plus"></i> New animation</button>
        <div class="ta-right">
          <label title="Default speed for NEW animations (grids/s)">Default speed
            <input type="number" class="default-speed" value="${Number(data.defaultSpeed) || 4}" min="0.5" step="0.5" style="width:72px;">
          </label>
          <label class="chk" title="New animations will snap points to grid">
            <input type="checkbox" class="default-snap" ${data.defaultSnap ? "checked" : ""}/>
            Snap new anims
          </label>
        </div>
      </div>
      <div class="token-animator-hint">
        Click “New animation”, then add waypoints (LMB). Enter = save, Backspace = undo, Esc = cancel.
      </div>
    `;
    wrap.appendChild(header);

    if (data.editing) {
      const eb = document.createElement("div");
      eb.className = "ta-edit-banner";
      eb.innerHTML = `
        <div class="ta-row">
          <div><b>Editing:</b> ${foundry.utils.escapeHTML(data.editing.name)}</div>
          <div class="ta-right">
            <label class="chk" title="Snap points while editing">
              <input type="checkbox" class="edit-snap" ${data.editing.snap ? "checked" : ""}/>
              Snap
            </label>
            <button class="edit-cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>
            <button class="edit-save"><i class="fa-solid fa-floppy-disk"></i> Save changes</button>
          </div>
        </div>
        <div class="token-animator-hint">
          Drag handles to move points. Right-click a handle to remove it (except the first). Tap empty area (LMB) to add a point.
        </div>
      `;
      wrap.appendChild(eb);
    }

    const list = document.createElement("div");
    list.classList.add("anim-list");

    const anims = data.anims;
    anims.forEach((anim, idx) => {
      const row = document.createElement("div");
      row.classList.add("anim-item");

      const speedVal = Number(anim.speed ?? data.defaultSpeed ?? 4) || 4;
      const snapVal  = !!anim.snap;

      row.innerHTML = `
        <input class="name" value="${foundry.utils.escapeHTML(anim.name)}" style="width:100%;" title="Rename animation"/>
        <label class="speed-wrap" title="Speed (grids/s)">
          <span>⚡</span>
          <input class="speed" type="number" min="0.5" step="0.5" value="${speedVal}" style="width:68px;">
        </label>
        <label class="chk" title="Snap waypoints">
          <input class="snap" type="checkbox" ${snapVal ? "checked" : ""}/>
          Snap
        </label>
        <div class="btns">
          <button class="play" title="Play / Resume"><i class="fa-solid fa-play"></i></button>
          <button class="pause" title="Pause"><i class="fa-solid fa-pause"></i></button>
          <button class="stop danger" title="Stop"><i class="fa-solid fa-stop"></i></button>
          <button class="edit" title="Edit path"><i class="fa-solid fa-pen"></i></button>
          <button class="del danger" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      const nameEl  = row.querySelector(".name");
      const speedEl = row.querySelector(".speed");
      const snapEl  = row.querySelector(".snap");

      nameEl.addEventListener("change", async () => {
        const name = nameEl.value?.trim() || anim.name;
        const newAnims = this._getAnims().map((a, i) => i === idx ? { ...a, name } : a);
        await this._setAnims(newAnims);
      });

      speedEl.addEventListener("change", async () => {
        const sp = Number(speedEl.value) || Number(this.state.defaultSpeed) || 4;
        const newAnims = this._getAnims().map((a, i) => i === idx ? { ...a, speed: sp } : a);
        await this._setAnims(newAnims);
      });

      snapEl.addEventListener("change", async () => {
        const snap = !!snapEl.checked;
        const old = this._getAnims()[idx];
        const points = this._applySnapToArray(old.points, snap);
        const newAnims = this._getAnims().map((a, i) => i === idx ? { ...a, snap, points } : a);
        await this._setAnims(newAnims);
      });

      row.querySelector(".play").addEventListener("click", () => {
        const sp   = Number(speedEl.value) || Number(this.state.defaultSpeed) || 4;
        const snap = !!snapEl.checked;
        const old  = this._getAnims()[idx];
        const animForPlay = { ...old, speed: sp, snap };
        game.modules.get(MODID)?.api?.play(this.token, animForPlay, { speed: sp });
      });
      row.querySelector(".pause").addEventListener("click", () => {
        game.modules.get(MODID)?.api?.pause(this.token);
      });
      row.querySelector(".stop").addEventListener("click", () => {
        game.modules.get(MODID)?.api?.stop(this.token);
      });

      row.querySelector(".edit").addEventListener("click", () => this._beginEdit(idx));

      row.querySelector(".del").addEventListener("click", async () => {
        const yes = await Dialog.confirm({
          title: "Remove animation",
          content: `<p>Remove <b>${foundry.utils.escapeHTML(anim.name)}</b>?</p>`
        });
        if (!yes) return;
        const newAnims = this._getAnims().filter((_, i) => i !== idx);
        await this._setAnims(newAnims);
      });

      list.appendChild(row);
    });
    wrap.appendChild(list);

    header.querySelector(".new-anim").addEventListener("click", () => this._startRecording());
    header.querySelector(".default-speed").addEventListener("change", ev => {
      this.state.defaultSpeed = Number(ev.currentTarget.value) || 4;
    });
    header.querySelector(".default-snap").addEventListener("change", ev => {
      this.state.defaultSnap = !!ev.currentTarget.checked;
    });

    if (data.editing) {
      wrap.querySelector(".edit-snap").addEventListener("change", (ev) => {
        if (!this.state.editing) return;
        this.state.editing.snap = !!ev.currentTarget.checked;
        if (this._overlay) this._overlay.drawPath();
      });
      wrap.querySelector(".edit-cancel").addEventListener("click", () => this._endEdit(false));
      wrap.querySelector(".edit-save").addEventListener("click", () => this._endEdit(true));
    }

    if (data.editing) this._mountEditOverlay(); else this._destroyOverlay();

    return wrap;
  }

  /* gravação */
  async _startRecording() {
    const name = await Dialog.prompt({
      title: "Animation name",
      content: `<p>Give your animation a name:</p><input type="text" value="Anim ${Math.floor(Math.random()*1000)}">`,
      label: "OK",
      rejectClose: true,
      callback: (html) => html.find("input").val()
    });
    if (!name) return;

    const cont = new PIXI.Container();
    cont.eventMode = "static";
    cont.interactiveChildren = true;
    cont.zIndex = 100000;
    cont.hitArea = this._fullHitAreaRect();
    canvas.stage.sortableChildren = true;
    canvas.stage.addChild(cont);

    const g = new PIXI.Graphics();
    cont.addChild(g);

    const points = [];
    const draw = () => {
      g.clear();
      g.lineStyle(3, 0x33ccff, 1.0);
      if (points.length) {
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      }
      for (const p of points) {
        g.beginFill(0xffffff, 0.9);
        g.drawCircle(p.x, p.y, 4);
        g.endFill();
      }
    };

    const start = this.token.center;
    const p0 = this._snapPoint({ x: start.x, y: start.y }, this.state.defaultSnap);
    points.push(p0);
    draw();

    // Apenas clique ESQUERDO adiciona ponto
    const onPointerUp = (ev) => {
      // PIXI v7: ev.button; fallback ev.data.button
      const btn = (typeof ev.button === "number") ? ev.button : ev.data?.button;
      if (btn !== 0) return; // só LMB
      const pos = ev.data.getLocalPosition(cont);
      const p = this._snapPoint(pos, this.state.defaultSnap);
      points.push(p);
      draw();
    };
    const onRight = () => { if (points.length > 1) points.pop(); draw(); };
    const onKey = (ev) => {
      if (ev.key === "Escape") return cleanup(false);
      if (ev.key === "Enter")  return cleanup(true);
      if (ev.key === "Backspace") return onRight();
    };

    cont.on("pointerup", onPointerUp);
    cont.on("rightdown", onRight);
    window.addEventListener("keydown", onKey);

    const cleanup = async (save) => {
      try {
        cont.off("pointerup", onPointerUp);
        cont.off("rightdown", onRight);
        window.removeEventListener("keydown", onKey);
      } finally { try { cont.destroy({ children: true }); } catch {} }
      if (save && points.length > 1) {
        const speed = Number(this.state.defaultSpeed) || 4;
        const anims = this._getAnims();
        anims.push({ name, points, speed, snap: !!this.state.defaultSnap, folderId: null });
        await this._setAnims(anims);
      }
    };
  }

  /* edição */
  _beginEdit(index) {
    const base = this._getAnims()[index];
    if (!base) return;
    this.state.editing = {
      index,
      name: base.name,
      points: base.points.map(p => ({...p})),
      snap: !!base.snap
    };
    this.render(true);
  }

  async _endEdit(save) {
    const ed = this.state.editing;
    if (!ed) return;
    const idx = ed.index;
    const anims = this._getAnims();
    if (!anims[idx]) { this._destroyOverlay(); this.state.editing = null; return; }

    if (save) {
      const pts = this._maybeSnapped(ed.points, ed.snap);
      anims[idx] = { ...anims[idx], points: pts, snap: !!ed.snap };
      await this._setAnims(anims);
    }
    this._destroyOverlay();
    this.state.editing = null;
    try { this.render(true); } catch {}
  }

  _mountEditOverlay() {
    if (this._overlay) { this._overlay.destroy(); this._overlay = null; }

    const oc = new PIXI.Container();
    oc.eventMode = "static";
    oc.interactiveChildren = true;
    oc.zIndex = 100000;
    oc.hitArea = this._fullHitAreaRect();
    canvas.stage.sortableChildren = true;
    canvas.stage.addChild(oc);

    const pathG = new PIXI.Graphics();
    oc.addChild(pathG);

    let handles = [];
    let draggingHandle = null; // { index, g }
    let handleCaptured = false;

    const drawPath = () => {
      const ed = this.state.editing; if (!ed) return;
      const pts = this._maybeSnapped(ed.points, ed.snap);
      pathG.clear();
      pathG.lineStyle(3, 0x33ccff, 1.0);
      if (pts.length) {
        pathG.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) pathG.lineTo(pts[i].x, pts[i].y);
      }
    };

    const destroyHandles = () => {
      for (const h of handles) { try { oc.removeChild(h.g); h.g.destroy(); } catch {} }
      handles = [];
    };

    const rebuildHandles = () => {
      destroyHandles();
      const ed = this.state.editing; if (!ed) return;
      const pts = this._maybeSnapped(ed.points, ed.snap);

      pts.forEach((p, i) => {
        const hg = new PIXI.Graphics();
        hg.beginFill(i === 0 ? 0x00ff88 : 0xffffff, 0.95);
        hg.lineStyle(2, 0x333333, 1);
        hg.drawCircle(0, 0, 6);
        hg.endFill();
        hg.x = p.x; hg.y = p.y;
        hg.cursor = "grab";
        hg.eventMode = "dynamic";
        hg.zIndex = 100001;

        const onDown = (ev) => {
          // só botão esquerdo inicia drag
          const btn = (typeof ev.button === "number") ? ev.button : ev.data?.button;
          if (btn !== 0) return;
          ev.stopPropagation();
          draggingHandle = { index: i, g: hg };
          handleCaptured = true;
          canvas.stage.on("pointermove", onStageMove);
          canvas.stage.on("pointerup", onStageUp);
          canvas.stage.on("pointerupoutside", onStageUp);
          hg.cursor = "grabbing";
        };

        const onRight = (ev) => {
          ev.stopPropagation();
          if (i === 0) return; // não remove o primeiro
          const ed2 = this.state.editing; if (!ed2) return;

          // se estivermos arrastando este handle, encerra listeners antes
          if (draggingHandle && draggingHandle.index === i) {
            canvas.stage.off("pointermove", onStageMove);
            canvas.stage.off("pointerup", onStageUp);
            canvas.stage.off("pointerupoutside", onStageUp);
            draggingHandle = null;
            handleCaptured = false;
          }

          ed2.points.splice(i, 1);
          drawPath();
          rebuildHandles();
        };

        hg.on("pointerdown", onDown);
        hg.on("rightdown", onRight);

        oc.addChild(hg);
        handles.push({ g: hg, index: i });
      });
    };

    const onStageMove = (ev) => {
      if (!draggingHandle) return;
      const ed = this.state.editing;
      if (!ed) return;

      // handle foi destruído? guarda
      if (!draggingHandle.g || !draggingHandle.g.parent) {
        draggingHandle = null;
        handleCaptured = false;
        canvas.stage.off("pointermove", onStageMove);
        canvas.stage.off("pointerup", onStageUp);
        canvas.stage.off("pointerupoutside", onStageUp);
        return;
      }

      // índice inválido após remoção?
      if (draggingHandle.index < 0 || draggingHandle.index >= ed.points.length) {
        draggingHandle = null;
        handleCaptured = false;
        canvas.stage.off("pointermove", onStageMove);
        canvas.stage.off("pointerup", onStageUp);
        canvas.stage.off("pointerupoutside", onStageUp);
        rebuildHandles();
        return;
      }

      ev.stopPropagation();
      const pos = ev.data.getLocalPosition(canvas.stage);
      const np = this._snapPoint(pos, ed.snap);
      ed.points[draggingHandle.index] = np;

      // mover o desenho do handle com segurança
      try { draggingHandle.g.x = np.x; draggingHandle.g.y = np.y; } catch {}
      drawPath();
    };

    const onStageUp = (ev) => {
      if (!draggingHandle) return;
      ev.stopPropagation();
      try { draggingHandle.g.cursor = "grab"; } catch {}
      draggingHandle = null;
      setTimeout(() => { handleCaptured = false; }, 0);
      rebuildHandles(); // reindexa
    };

    // Adicionar ponto só com clique ESQUERDO na área vazia
    const onTap = (ev) => {
      if (handleCaptured) return;
      const btn = (typeof ev.button === "number") ? ev.button : ev.data?.button;
      if (btn !== 0) return; // apenas LMB adiciona
      const ed = this.state.editing; if (!ed) return;
      const pos = ev.data.getLocalPosition(oc);
      const np = this._snapPoint(pos, ed.snap);
      ed.points.push(np);
      drawPath(); rebuildHandles();
    };

    oc.on("pointerup", onTap);            // pointerup + filtro de botão
    oc.on("rightdown", () => {});         // RMB na área vazia não faz nada
    drawPath(); rebuildHandles();

    const onKey = (ev) => { if (ev.key === "Escape") this._endEdit(false); if (ev.key === "Enter") this._endEdit(true); };
    window.addEventListener("keydown", onKey);

    this._overlay = {
      drawPath, rebuildHandles,
      destroy: () => {
        try {
          oc.off("pointerup", onTap);
          oc.off("rightdown", () => {});
          window.removeEventListener("keydown", onKey);
          canvas.stage.off("pointermove", onStageMove);
          canvas.stage.off("pointerup", onStageUp);
          canvas.stage.off("pointerupoutside", onStageUp);
          destroyHandles();
          oc.destroy({ children: true });
        } catch {}
      }
    };
  }

  _destroyOverlay() {
    if (this._overlay) { try { this._overlay.destroy(); } catch {} this._overlay = null; }
  }
}
