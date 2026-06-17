/* ============================================================
 * 西游杀 - 界面与交互（移动端触屏优先）
 * 通过 Promise 把玩家的点击反馈给异步引擎
 * ============================================================ */

class UI {
  constructor() {
    this.game = null;
    this.selectedCard = null;
    this.pendingResolve = null;   // 当前等待的 Promise resolve
    this.mode = 'idle';
    this.el = {};
    this.cacheDom();
  }

  cacheDom() {
    this.el.opponents = document.getElementById('opponents');
    this.el.self = document.getElementById('self-area');
    this.el.hand = document.getElementById('hand');
    this.el.log = document.getElementById('log');
    this.el.prompt = document.getElementById('prompt-bar');
    this.el.modal = document.getElementById('modal');
    this.el.modalBody = document.getElementById('modal-body');
    this.el.phaseInfo = document.getElementById('phase-info');
  }

  bind(game) { this.game = game; }

  /* ---------------- 日志 ---------------- */
  appendLog(msg) {
    const div = document.createElement('div');
    div.className = 'log-line';
    div.textContent = msg;
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
    while (this.el.log.childNodes.length > 200) this.el.log.removeChild(this.el.log.firstChild);
  }

  /* ---------------- 渲染 ---------------- */
  render() {
    if (!this.game) return;
    this.renderOpponents();
    this.renderSelf();
  }

  identityBadge(p) {
    if (!p.identityRevealed && !p.isHuman) return '<span class="ident hidden">身份?</span>';
    const info = IDENTITY[p.identity];
    return `<span class="ident" style="background:${info.color}">${info.name}</span>`;
  }

  hpBar(p) {
    let s = '';
    for (let i = 0; i < p.maxHp; i++) {
      s += `<span class="hp-dot ${i < p.hp ? 'on' : 'off'}"></span>`;
    }
    return `<div class="hp-bar">${s}</div>`;
  }

  equipLine(p) {
    const e = p.equip;
    const parts = [];
    if (e.weapon) parts.push(`🗡${e.weapon.name}`);
    if (e.armor) parts.push(`🛡${e.armor.name}`);
    if (e.horsePlus) parts.push(`🐎+1`);
    if (e.horseMinus) parts.push(`🐎-1`);
    return parts.length ? `<div class="equip-line">${parts.join(' ')}</div>` : '';
  }

  judgeLine(p) {
    if (!p.judgeZone.length) return '';
    return `<div class="judge-line">${p.judgeZone.map(c => '⏳' + c.name).join(' ')}</div>`;
  }

  renderOpponents() {
    const g = this.game;
    const me = g.players[0];
    this.el.opponents.innerHTML = '';
    g.players.forEach((p, i) => {
      if (p.isHuman) return;
      const card = document.createElement('div');
      card.className = 'opp' + (p.alive ? '' : ' dead') +
        (g.players[g.turnIndex] === p ? ' active' : '') +
        (this.mode === 'target' && this._targetCands && this._targetCands.includes(p) ? ' targetable' : '');
      card.innerHTML = `
        <div class="opp-top">
          <span class="avatar">${p.character.avatar}</span>
          ${this.identityBadge(p)}
        </div>
        <div class="opp-name">${p.name}·${p.character.name}</div>
        ${this.hpBar(p)}
        <div class="opp-meta">手牌 ${p.hand.length}</div>
        ${this.equipLine(p)}
        ${this.judgeLine(p)}
      `;
      if (this.mode === 'target' && this._targetCands && this._targetCands.includes(p)) {
        card.onclick = () => this.pickTarget(p);
      }
      this.el.opponents.appendChild(card);
    });
  }

  renderSelf() {
    const g = this.game;
    const me = g.players[0];
    const isMyTurn = g.players[g.turnIndex] === me;
    this.el.self.innerHTML = `
      <div class="self-info">
        <span class="avatar big">${me.character.avatar}</span>
        <div class="self-detail">
          <div class="self-name">${me.name}·${me.character.name} <span class="title">${me.character.title}</span> ${this.identityBadge(me)}</div>
          ${this.hpBar(me)}
          ${this.equipLine(me)}
          ${this.judgeLine(me)}
          <div class="skill-mini">【${me.character.skillName}】</div>
        </div>
      </div>`;

    // 手牌
    this.el.hand.innerHTML = '';
    me.hand.forEach(c => {
      const div = this.makeCardEl(c);
      const canPlay = isMyTurn && this.mode === 'play' && this.isPlayable(me, c).playable;
      if (this.mode === 'play' && isMyTurn) {
        if (canPlay) {
          div.classList.add('playable');
          div.onclick = () => this.onPlayCardClick(c);
        } else {
          div.classList.add('disabled');
        }
      }
      if (this.mode === 'selectCard' && this._selectFilter(c)) {
        div.classList.add('playable');
        div.onclick = () => this.resolveSelect(c);
      } else if (this.mode === 'selectCard') {
        div.classList.add('disabled');
      }
      if (this.mode === 'discard') {
        div.classList.add('playable');
        div.onclick = () => this.resolveSelect(c);
      }
      this.el.hand.appendChild(div);
    });
  }

  makeCardEl(c) {
    const div = document.createElement('div');
    const red = isRed(c.suit);
    div.className = 'card ' + (red ? 'red' : 'black') + ' type-' + c.type;
    div.innerHTML = `
      <div class="card-corner">${SUIT_SYMBOL[c.suit]}${pointLabel(c.point)}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-kind">${this.kindLabel(c)}</div>`;
    return div;
  }

  kindLabel(c) {
    if (c.type === 'basic') return '基本';
    if (c.type === 'equip') {
      return { weapon: '武器', armor: '防具', horsePlus: '+1马', horseMinus: '-1马' }[c.equipKind];
    }
    return c.trickKind === 'delayed' ? '延时锦囊' : '锦囊';
  }

  /* ---------------- 可玩性判断 ---------------- */
  isPlayable(me, c) {
    if (c.type === 'equip') return { playable: true, target: 'none' };
    if (c.type === 'basic') {
      if (c.basicKind === 'sha') {
        const max = me.character.extraShaCount ? me.character.extraShaCount(me) : 1;
        if ((me._shaUsed || 0) >= max) return { playable: false };
        const cands = this.game.players.filter(p => p.alive && p !== me && this.game.inAttackRange(me, p));
        return { playable: cands.length > 0, target: 'single', cands };
      }
      if (c.basicKind === 'tao') return { playable: me.hp < me.maxHp, target: 'none' };
      return { playable: false }; // 闪不可主动出
    }
    if (c.type === 'trick') {
      if (c.key === 'wuxie') return { playable: false };
      if (c.key === 'huazhai') return { playable: true, target: 'self' };
      if (c.key === 'pantao' || c.key === 'qunyao' || c.key === 'feisha') return { playable: true, target: 'all' };
      if (c.key === 'tianlei') return { playable: true, target: 'self' };
      if (c.key === 'jingu') {
        const cands = this.game.players.filter(p => p.alive && p !== me && !p.judgeZone.some(z => z.key === 'jingu'));
        return { playable: cands.length > 0, target: 'single', cands };
      }
      if (c.key === 'shunshou') {
        const cands = this.game.players.filter(p => p.alive && p !== me &&
          (p.hand.length || this.game.hasEquip(p) || p.judgeZone.length) && this.game.distance(me, p) <= 1);
        return { playable: cands.length > 0, target: 'single', cands };
      }
      if (c.key === 'chaiqiao') {
        const cands = this.game.players.filter(p => p.alive && p !== me &&
          (p.hand.length || this.game.hasEquip(p) || p.judgeZone.length));
        return { playable: cands.length > 0, target: 'single', cands };
      }
      if (c.key === 'doufa') {
        const cands = this.game.players.filter(p => p.alive && p !== me);
        return { playable: cands.length > 0, target: 'single', cands };
      }
    }
    return { playable: false };
  }

  /* ---------------- 人类出牌阶段 ---------------- */
  runHumanPlayPhase(player) {
    return new Promise(resolve => {
      this.mode = 'play';
      this._endPhaseResolve = resolve;
      this.setPrompt(`你的出牌阶段：点击可用的牌出牌`, true);
      this.render();
    });
  }

  endHumanPlayPhase() {
    if (this._endPhaseResolve) {
      const r = this._endPhaseResolve;
      this._endPhaseResolve = null;
      this.mode = 'idle';
      this.setPrompt('');
      r();
    }
  }

  async onPlayCardClick(card) {
    if (this._busy) return;
    const me = this.game.players[0];
    const info = this.isPlayable(me, card);
    if (!info.playable) return;

    if (info.target === 'none' || info.target === 'self' || info.target === 'all') {
      this._busy = true;
      this.mode = 'idle';
      const targets = info.target === 'self' ? [me] : [];
      await this.game.useCard(me, card, targets);
      this._busy = false;
      if (!this.game.over && me.alive) { this.mode = 'play'; this.setPrompt('你的出牌阶段：点击可用的牌出牌', true); }
      this.render();
      return;
    }

    if (info.target === 'single') {
      // 进入选目标模式
      const t = await this.promptTarget(me, info.cands, `为「${card.name}」选择目标`);
      if (!t) { this.mode = 'play'; this.render(); return; }
      this._busy = true;
      this.mode = 'idle';
      await this.game.useCard(me, card, [t]);
      this._busy = false;
      if (!this.game.over && me.alive) { this.mode = 'play'; this.setPrompt('你的出牌阶段：点击可用的牌出牌', true); }
      this.render();
    }
  }

  /* ---------------- 选目标 ---------------- */
  promptTarget(player, candidates, prompt) {
    return new Promise(resolve => {
      this.mode = 'target';
      this._targetCands = candidates;
      this.setPrompt(prompt + '（点击上方角色，或点击取消）', false, () => {
        this.mode = 'play'; this._targetCands = null; this.render(); resolve(null);
      });
      this._targetResolve = resolve;
      this.render();
    });
  }

  pickTarget(p) {
    if (this._targetResolve) {
      const r = this._targetResolve;
      this._targetResolve = null;
      this._targetCands = null;
      this.mode = 'idle';
      this.setPrompt('');
      r(p);
    }
  }

  /* ---------------- 选牌（响应：闪/桃/杀/无懈） ---------------- */
  promptCard(player, kinds, prompt, ctx) {
    ctx = ctx || {};
    return new Promise(resolve => {
      this.mode = 'selectCard';
      this._selectResolve = resolve;
      if (ctx.onlyKey) {
        this._selectFilter = c => c.key === ctx.onlyKey;
      } else if (ctx.anyCard) {
        this._selectFilter = () => true;
      } else if (kinds && kinds.length) {
        const usable = this.game.findUsableBasic(player, kinds[0]);
        const ids = new Set(usable.map(c => c.uid));
        this._selectFilter = c => ids.has(c.uid);
      } else {
        this._selectFilter = () => true;
      }
      this.setPrompt(prompt + '（点击手牌选择，或取消放弃）', false, () => {
        this._finishSelect(null);
      });
      this.render();
    });
  }

  resolveSelect(card) { this._finishSelect(card); }

  _finishSelect(card) {
    if (this._selectResolve) {
      const r = this._selectResolve;
      this._selectResolve = null;
      this._selectFilter = null;
      this.mode = 'idle';
      this.setPrompt('');
      this.render();
      r(card);
    }
  }

  /* 选牌区（顺手牵羊/过河拆桥，从他人区域选） */
  promptCardZone(target, pool, prompt) {
    return new Promise(resolve => {
      this.openModal(prompt, pool.map(item => ({
        label: `${item.label || '手牌'}：${item.zone === 'hand' ? '🎴' : item.card.name}`,
        onClick: () => { this.closeModal(); resolve(item); }
      })));
    });
  }

  /* ---------------- 是否（Yes/No） ---------------- */
  promptYesNo(player, prompt, ctx) {
    return new Promise(resolve => {
      this.openModal(prompt, [
        { label: '是', cls: 'yes', onClick: () => { this.closeModal(); resolve(true); } },
        { label: '否', cls: 'no', onClick: () => { this.closeModal(); resolve(false); } },
      ]);
    });
  }

  /* ---------------- 弃牌 ---------------- */
  promptDiscard(player, n) {
    return new Promise(resolve => {
      this.mode = 'discard';
      this._selectResolve = resolve;
      this.setPrompt(`弃牌阶段：手牌超出上限，需弃置 ${n} 张（点击手牌）`, false);
      this.render();
    });
  }

  /* ---------------- 提示条 ---------------- */
  setPrompt(text, showEnd, onCancel) {
    const bar = this.el.prompt;
    bar.innerHTML = '';
    if (!text) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const span = document.createElement('span');
    span.className = 'prompt-text';
    span.textContent = text;
    bar.appendChild(span);
    if (showEnd) {
      const btn = document.createElement('button');
      btn.className = 'btn end-btn';
      btn.textContent = '结束出牌';
      btn.onclick = () => this.endHumanPlayPhase();
      bar.appendChild(btn);
    }
    if (onCancel) {
      const btn = document.createElement('button');
      btn.className = 'btn cancel-btn';
      btn.textContent = '取消';
      btn.onclick = onCancel;
      bar.appendChild(btn);
    }
  }

  /* ---------------- 模态框 ---------------- */
  openModal(text, buttons) {
    this.el.modalBody.innerHTML = `<div class="modal-text">${text}</div>`;
    const wrap = document.createElement('div');
    wrap.className = 'modal-btns';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.label;
      btn.onclick = b.onClick;
      wrap.appendChild(btn);
    });
    this.el.modalBody.appendChild(wrap);
    this.el.modal.style.display = 'flex';
  }

  closeModal() { this.el.modal.style.display = 'none'; }

  /* ---------------- 结算画面 ---------------- */
  showResult(camp, msg) {
    const me = this.game.players[0];
    let win = false;
    if (camp === '取经队') win = (me.identity === 'zhugong' || me.identity === 'zhongchen');
    else if (camp === '反贼') win = (me.identity === 'fanzei');
    else if (camp === '内奸') win = (me.identity === 'neijian');

    const idents = this.game.players.map(p =>
      `${p.name}·${p.character.name}：${IDENTITY[p.identity].name}${p.alive ? '' : '（阵亡）'}`).join('<br>');

    this.openModal(
      `<h2 class="${win ? 'win' : 'lose'}">${win ? '🎉 胜利！' : '💀 失败'}</h2>
       <p>${msg}</p>
       <p style="font-size:13px;color:#888">你的身份：${IDENTITY[me.identity].name}</p>
       <hr><div style="font-size:12px;text-align:left;line-height:1.7">${idents}</div>`,
      [{ label: '再来一局', cls: 'yes', onClick: () => location.reload() }]
    );
  }
}
