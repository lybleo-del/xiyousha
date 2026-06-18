/* ============================================================
 * 西游杀 - 游戏引擎
 * 负责：牌堆、回合流程、卡牌结算、伤害/濒死、胜负判定
 * 采用 async/await 处理需要玩家响应的异步流程（如出闪、无懈）
 * ============================================================ */

/* 身份定义
 *  zhugong 主公  - 取经队核心（唐僧），多 1 血，需消灭所有妖魔+内奸
 *  zhongchen 忠臣 - 保护主公
 *  fanzei 反贼   - 击杀主公
 *  neijian 内奸  - 最后独存
 */
const IDENTITY = {
  zhugong: { name: '主公', color: '#e8b923' },
  zhongchen: { name: '忠臣', color: '#3fa7ff' },
  fanzei: { name: '反贼', color: '#ff5a5a' },
  neijian: { name: '内奸', color: '#b06bff' },
};

class Player {
  constructor(id, name, isHuman) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.character = null;
    this.identity = null;
    this.identityRevealed = false; // 死亡或主公时公开
    this.maxHp = 4;
    this.hp = 4;
    this.hand = [];
    this.equip = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    this.judgeZone = []; // 延时锦囊：紧箍咒、天雷
    this.alive = true;
    this.flags = {};
    this.exposed = false; // AI 行为：是否暴露为主公敌对
  }
  hasCardOfKind(basicKind) {
    return this.hand.some(c => c.basicKind === basicKind);
  }
}

class Game {
  constructor(opts) {
    this.ui = opts.ui;
    this.numPlayers = opts.numPlayers || 5;
    this.players = [];
    this.deck = [];
    this.discardPile = [];
    this.turnIndex = 0;
    this.over = false;
    this.logs = [];
  }

  log(msg) {
    this.logs.push(msg);
    if (this.ui) this.ui.appendLog(msg);
  }

  /* ---------------- 初始化 ---------------- */
  setup(playerCharId) {
    this.deck = buildDeck();
    this.shuffle(this.deck);

    // 身份分配（标准西游杀比例）
    const idents = this.makeIdentities(this.numPlayers);
    // 玩家固定为 0 号位，且为主公(唐僧队)，更适合单机体验？
    // 这里采用：随机身份，更接近原桌游。玩家为 0 号。
    this.shuffle(idents);

    // 武将随机分配，玩家可指定
    const charPool = CHARACTERS.slice();
    this.shuffle(charPool);

    for (let i = 0; i < this.numPlayers; i++) {
      const isHuman = (i === 0);
      const p = new Player(i, isHuman ? '你' : this.aiName(i), isHuman);
      p.identity = idents[i];
      if (p.identity === 'zhugong') p.identityRevealed = true;
      this.players.push(p);
    }

    // 确保主公在 0 号位优先级？标准是主公先选将。这里保持随机身份。
    // 分配武将
    this.players.forEach(p => {
      let chosen;
      if (p.isHuman && playerCharId) {
        chosen = CHARACTERS.find(c => c.id === playerCharId);
        const idx = charPool.findIndex(c => c.id === playerCharId);
        if (idx >= 0) charPool.splice(idx, 1);
      }
      if (!chosen) chosen = charPool.pop();
      p.character = chosen;
      p.maxHp = chosen.maxHp + (p.identity === 'zhugong' ? (chosen.lordHpBonus || 1) : 0);
      p.hp = p.maxHp;
    });

    // 起始手牌：每人 4 张
    this.players.forEach(p => this.draw(p, 4, true));

    // 主公先手
    const lordIdx = this.players.findIndex(p => p.identity === 'zhugong');
    this.turnIndex = lordIdx >= 0 ? lordIdx : 0;

    this.log('—— 西游杀 开局 ——');
    this.log(`身份配置：${this.identitySummary()}`);
  }

  makeIdentities(n) {
    // 参考三国杀人数配置
    const table = {
      4: ['zhugong', 'zhongchen', 'fanzei', 'neijian'],
      5: ['zhugong', 'zhongchen', 'fanzei', 'fanzei', 'neijian'],
      6: ['zhugong', 'zhongchen', 'fanzei', 'fanzei', 'fanzei', 'neijian'],
      7: ['zhugong', 'zhongchen', 'zhongchen', 'fanzei', 'fanzei', 'fanzei', 'neijian'],
      8: ['zhugong', 'zhongchen', 'zhongchen', 'fanzei', 'fanzei', 'fanzei', 'fanzei', 'neijian'],
    };
    return (table[n] || table[5]).slice();
  }

  identitySummary() {
    const counts = {};
    this.players.forEach(p => counts[p.identity] = (counts[p.identity] || 0) + 1);
    return Object.keys(counts).map(k => `${IDENTITY[k].name}×${counts[k]}`).join('  ');
  }

  aiName(i) {
    return 'AI-' + i;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ---------------- 牌堆操作 ---------------- */
  drawCard() {
    if (this.deck.length === 0) {
      // 弃牌堆洗回
      if (this.discardPile.length === 0) return null;
      this.deck = this.shuffle(this.discardPile.splice(0));
      this.log('牌堆已洗牌');
    }
    return this.deck.pop();
  }

  draw(player, n, silent) {
    const got = [];
    for (let i = 0; i < n; i++) {
      const c = this.drawCard();
      if (c) { player.hand.push(c); got.push(c); }
    }
    if (!silent && got.length) this.log(`${player.name} 摸了 ${got.length} 张牌`);
    if (this.ui) {
      if (!silent && got.length) SFX.draw();
      this.ui.render();
    }
    return got;
  }

  discardCardObj(card) {
    this.discardPile.push(card);
  }

  removeFromHand(player, card) {
    const i = player.hand.findIndex(c => c.uid === card.uid);
    if (i >= 0) player.hand.splice(i, 1);
  }

  hasEquip(player) {
    return player.equip.weapon || player.equip.armor || player.equip.horsePlus || player.equip.horseMinus;
  }

  allEquipCards(player) {
    return ['weapon', 'armor', 'horsePlus', 'horseMinus']
      .map(k => player.equip[k]).filter(Boolean);
  }

  /* 弃置某角色一张随机牌（手牌优先，含装备/判定区） */
  discardRandomCardFrom(target, allowJudge) {
    const pool = [];
    target.hand.forEach(c => pool.push({ zone: 'hand', card: c }));
    this.allEquipCards(target).forEach(c => pool.push({ zone: 'equip', card: c }));
    if (allowJudge) target.judgeZone.forEach(c => pool.push({ zone: 'judge', card: c }));
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.removeCardFromZone(target, pick);
    this.discardCardObj(pick.card);
    if (this.ui) this.ui.render();
    return pick.card;
  }

  stealRandomCard(thief, target) {
    const pool = [];
    target.hand.forEach(c => pool.push({ zone: 'hand', card: c }));
    this.allEquipCards(target).forEach(c => pool.push({ zone: 'equip', card: c }));
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.removeCardFromZone(target, pick);
    thief.hand.push(pick.card);
    if (this.ui) this.ui.render();
    return pick.card;
  }

  removeCardFromZone(player, pick) {
    if (pick.zone === 'hand') this.removeFromHand(player, pick.card);
    else if (pick.zone === 'judge') {
      const i = player.judgeZone.findIndex(c => c.uid === pick.card.uid);
      if (i >= 0) player.judgeZone.splice(i, 1);
    } else {
      ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(k => {
        if (player.equip[k] && player.equip[k].uid === pick.card.uid) player.equip[k] = null;
      });
    }
  }

  /* ---------------- 距离与范围 ---------------- */
  seatDistance(from, to) {
    const alive = this.players.filter(p => p.alive);
    const fi = alive.indexOf(from), ti = alive.indexOf(to);
    if (fi < 0 || ti < 0) return 99;
    const n = alive.length;
    const d = Math.abs(fi - ti);
    return Math.min(d, n - d);
  }

  distance(from, to) {
    let d = this.seatDistance(from, to);
    // 进攻马 / 技能 (from 视角 -1)
    if (from.equip.horseMinus) d -= 1;
    if (from.character.distanceFromBonus) d -= from.character.distanceFromBonus(from);
    // 防御马 / 技能 (to 视角 +1)
    if (to.equip.horsePlus) d += 1;
    if (to.character.distanceToBonus) d += to.character.distanceToBonus(to);
    return Math.max(1, d);
  }

  attackRange(player) {
    let r = 1;
    if (player.equip.weapon) r = player.equip.weapon.range;
    if (player.character.attackRangeBonus) r += player.character.attackRangeBonus(player);
    return r;
  }

  inAttackRange(from, to) {
    if (from.character.shaIgnoreDistance && from.character.shaIgnoreDistance(from)) return true;
    return this.distance(from, to) <= this.attackRange(from);
  }

  /* ---------------- 异步询问 ----------------
   * 对人类玩家：交给 UI 弹出选择，返回 Promise
   * 对 AI：交给 AI 模块同步决策
   * ------------------------------------------------ */
  async askPlayCard(player, kinds, prompt, ctx) {
    // 返回一张满足条件的牌或 null（放弃）
    if (player.isHuman) {
      return await this.ui.promptCard(player, kinds, prompt, ctx);
    } else {
      return AI.respondCard(this, player, kinds, ctx);
    }
  }

  async askYesNo(player, prompt, ctx) {
    if (player.isHuman) return await this.ui.promptYesNo(player, prompt, ctx);
    return AI.respondYesNo(this, player, prompt, ctx);
  }

  async askChooseTarget(player, candidates, prompt) {
    if (player.isHuman) return await this.ui.promptTarget(player, candidates, prompt);
    return AI.chooseTarget(this, player, candidates, prompt);
  }

  /* 找出可作为某基本牌打出的手牌（含技能转化） */
  findUsableBasic(player, basicKind) {
    const direct = player.hand.filter(c => c.basicKind === basicKind);
    if (basicKind === 'shan' && player.character.redCardAsShan && player.character.redCardAsShan(player)) {
      const reds = player.hand.filter(c => isRed(c.suit) && c.basicKind !== 'shan');
      return direct.concat(reds);
    }
    return direct;
  }

  /* ---------------- 判定 ---------------- */
  doJudge(player, reason) {
    const card = this.drawCard();
    if (!card) return null;
    this.discardCardObj(card);
    this.log(`${player.name} ${reason}判定：${SUIT_SYMBOL[card.suit]}${pointLabel(card.point)} ${card.name}`);
    if (this.ui) { this.ui.animateJudge(); this.ui.render(); }
    return card;
  }

  /* ---------------- 伤害与濒死 ---------------- */
  async dealDamage(source, target, amount, opts) {
    opts = opts || {};
    if (!target.alive || amount <= 0) return;
    target.hp -= amount;
    this.log(`${target.name} 受到 ${amount} 点${opts.tag || ''}伤害（剩余体力 ${Math.max(target.hp, 0)}）`);
    if (this.ui) { this.ui.animateDamage(target, amount); this.ui.render(); await this.pause(950); }

    // 受伤后技能
    if (target.character.onAfterDamaged) target.character.onAfterDamaged(this, target, source, amount);

    // 造成伤害后技能（红孩儿/白骨精）
    if (source && source !== target && source.character.onAfterDamageDealt) {
      source.character.onAfterDamageDealt(this, source, target, amount);
    }

    // AI 暴露：攻击主公者暴露为反贼倾向
    if (source && target.identity === 'zhugong' && source.identity !== 'zhugong') {
      source.exposed = true;
    }

    if (target.hp <= 0) {
      await this.handleDying(target, source);
    }
  }

  async handleDying(target, source) {
    // 濒死：依次请求所有角色对其使用桃（自己先）
    const order = this.aliveInTurnOrderFrom(target);
    for (const p of order) {
      while (target.hp <= 0) {
        const canHelp = p === target || this.peachAllowedForOther(p, target);
        if (!canHelp) break;
        const tao = this.findUsableBasic(p, 'tao');
        if (!tao.length) break;
        let useIt;
        if (p.isHuman) {
          useIt = await this.ui.promptYesNo(p,
            `${target.name} 濒死（体力 ${target.hp}），是否使用「桃」相救？`, { dying: target });
        } else {
          useIt = AI.decidePeachSave(this, p, target);
        }
        if (!useIt) break;
        const card = p.isHuman ? await this.ui.promptCard(p, ['tao'], '选择「桃」', { save: target })
                               : tao[0];
        if (!card) break;
        this.playCardFromHand(p, card);
        target.hp += 1;
        this.log(`${p.name} 使用「桃」救了 ${target.name}（体力 ${target.hp}）`);
        if (this.ui) { this.ui.animateHeal(target, 1); this.ui.render(); }
      }
      if (target.hp > 0) break;
    }

    if (target.hp <= 0) {
      await this.killPlayer(target, source);
    }
  }

  // 普度众生(唐僧主公技)：取经队角色濒死，全场可救；否则仅自己可救
  peachAllowedForOther(helper, dying) {
    const lord = this.players.find(p => p.identity === 'zhugong' && p.character.id === 'tangseng');
    if (lord && lord.alive && (dying.identity === 'zhugong' || dying.identity === 'zhongchen')) {
      return true;
    }
    // 标准规则：濒死时仅濒死者自己可用桃；此处放宽——任何人都可救（更休闲）
    return true;
  }

  async killPlayer(target, source) {
    target.alive = false;
    target.identityRevealed = true;
    if (this.ui) this.ui.animateDeath(target);
    this.log(`☠ ${target.name}（${target.character.name}·${IDENTITY[target.identity].name}）阵亡`);
    // 弃置其所有牌
    target.hand.forEach(c => this.discardCardObj(c));
    this.allEquipCards(target).forEach(c => this.discardCardObj(c));
    target.judgeZone.forEach(c => this.discardCardObj(c));
    target.hand = []; target.judgeZone = [];
    target.equip = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    if (this.ui) this.ui.render();

    // 奖惩
    if (source && source.alive) {
      if (target.identity === 'fanzei') {
        this.draw(source, 3);
        this.log(`${source.name} 击杀反贼，摸 3 张牌`);
      } else if (target.identity === 'zhongchen' && source.identity === 'zhugong') {
        // 主公杀忠臣，弃置所有手牌与装备
        source.hand.forEach(c => this.discardCardObj(c));
        this.allEquipCards(source).forEach(c => this.discardCardObj(c));
        source.hand = [];
        source.equip = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
        this.log(`${source.name}（主公）误杀忠臣，弃置所有手牌及装备`);
        if (this.ui) this.ui.render();
      }
    }

    this.checkGameOver();
  }

  aliveInTurnOrderFrom(start) {
    const alive = this.players.filter(p => p.alive || p === start);
    const idx = alive.indexOf(start);
    const res = [];
    for (let i = 0; i < alive.length; i++) res.push(alive[(idx + i) % alive.length]);
    return res.filter(p => p.alive || p === start);
  }

  /* ---------------- 胜负 ---------------- */
  checkGameOver() {
    const alive = this.players.filter(p => p.alive);
    const lord = this.players.find(p => p.identity === 'zhugong');
    const rebelsAlive = this.players.some(p => p.alive && p.identity === 'fanzei');
    const spyAlive = this.players.some(p => p.alive && p.identity === 'neijian');

    if (!lord.alive) {
      // 主公死亡
      if (alive.length === 1 && alive[0].identity === 'neijian') {
        this.endGame('内奸', '内奸独存，阴谋得逞！');
      } else {
        this.endGame('反贼', '主公已死，反贼获胜！');
      }
      return true;
    }
    // 主公存活：反贼与内奸全灭则取经队胜
    if (!rebelsAlive && !spyAlive) {
      this.endGame('取经队', '妖魔尽除，主公与忠臣获胜！');
      return true;
    }
    return false;
  }

  endGame(winnerCamp, msg) {
    this.over = true;
    this.winnerCamp = winnerCamp;
    this.log(`🏆 游戏结束：${msg}`);
    if (this.ui) this.ui.showResult(winnerCamp, msg);
  }
}
