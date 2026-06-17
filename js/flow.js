/* ============================================================
 * 西游杀 - 回合流程 与 卡牌结算
 * （以方法形式扩展 Game.prototype）
 * ============================================================ */

/* 将一张手牌移出并进入弃牌堆（作为打出/使用的消耗） */
Game.prototype.playCardFromHand = function (player, card) {
  this.removeFromHand(player, card);
  this.discardCardObj(card);
  if (this.ui) this.ui.render();
};

/* ---------------- 无懈可击 连锁 ----------------
 * 当一张锦囊生效前，按座位顺序询问所有人是否使用无懈可击。
 * 偶数次无懈 = 生效；奇数次 = 抵消。
 * 返回 true 表示“最终被抵消”。
 * ---------------------------------------------------- */
Game.prototype.askWuxieChain = async function (originCard, targetPlayer, sourcePlayer) {
  let negated = false;
  let asking = true;
  while (asking) {
    asking = false;
    const order = this.players.filter(p => p.alive);
    for (const p of order) {
      const wx = p.hand.filter(c => c.key === 'wuxie');
      if (!wx.length) continue;
      let use;
      if (p.isHuman) {
        use = await this.ui.promptYesNo(p,
          `是否对【${originCard.name}】${negated ? '的无懈' : ''}使用「无懈可击」？`, { wuxie: true });
      } else {
        use = AI.decideWuxie(this, p, originCard, targetPlayer, sourcePlayer, negated);
      }
      if (use) {
        const card = p.isHuman
          ? await this.ui.promptCard(p, [], '选择「无懈可击」', { onlyKey: 'wuxie' })
          : wx[0];
        if (card) {
          this.playCardFromHand(p, card);
          negated = !negated;
          this.log(`${p.name} 使用「无懈可击」${negated ? '抵消' : '反抵消'}了【${originCard.name}】`);
          asking = true; // 重新询问一轮（可被再无懈）
          break;
        }
      }
    }
  }
  return negated;
};

/* ---------------- 出杀结算（含闪、武器、牛魔王蛮力） ---------------- */
Game.prototype.resolveSha = async function (source, target, shaCard, opts) {
  opts = opts || {};
  this.log(`${source.name} 对 ${target.name} 使用「杀」`);

  // 目标响应闪
  const dodged = await this.requestShan(target, source, shaCard);
  if (dodged) {
    this.log(`${target.name} 打出「闪」抵消了「杀」`);
    return;
  }

  // 伤害结算
  let dmg = 1;
  // 牛魔王 蛮力
  if (source.character.bruteForce && !source._bruteUsed && source.hand.length && !source.isHuman) {
    if (AI.shouldBruteForce(this, source, target)) {
      source._bruteUsed = true;
      const c = source.hand[0];
      this.playCardFromHand(source, c);
      dmg += 1;
      this.log(`${source.name} 发动【蛮力】弃牌使伤害 +1`);
    }
  } else if (source.character.bruteForce && !source._bruteUsed && source.isHuman && source.hand.length) {
    const yes = await this.ui.promptYesNo(source, '是否发动【蛮力】弃一张手牌使「杀」伤害 +1？', {});
    if (yes) {
      source._bruteUsed = true;
      const c = await this.ui.promptCard(source, [], '选择弃置的牌', { anyCard: true });
      if (c) { this.playCardFromHand(source, c); dmg += 1; this.log(`${source.name} 发动【蛮力】伤害 +1`); }
    }
  }

  await this.dealDamage(source, target, dmg, { tag: '' });
};

/* 请求目标打出闪（含莲花宝甲八卦判定） */
Game.prototype.requestShan = async function (target, source, shaCard) {
  // 二郎神神威 / 无视防具
  const ignoreArmor = source.character.ignoreArmor && source.character.ignoreArmor(source);

  // 莲花宝甲：判定红色视为闪
  if (!ignoreArmor && target.equip.armor && target.equip.armor.key === 'lianhuajia') {
    const j = this.doJudge(target, '【莲花宝甲】');
    if (j && isRed(j.suit)) {
      this.log(`${target.name} 莲花宝甲判定为红色，视为打出「闪」`);
      return true;
    }
  }

  const shans = this.findUsableBasic(target, 'shan');
  if (!shans.length) return false;

  let useIt;
  if (target.isHuman) {
    useIt = await this.ui.promptYesNo(target,
      `${source.name} 对你使用「杀」，是否打出「闪」？`, { needShan: true });
  } else {
    useIt = AI.decideShan(this, target, source);
  }
  if (!useIt) return false;

  const card = target.isHuman
    ? await this.ui.promptCard(target, ['shan'], '选择「闪」', { asShan: true })
    : shans[0];
  if (!card) return false;
  this.playCardFromHand(target, card);
  return true;
};

/* ---------------- 通用卡牌使用入口 ---------------- */
Game.prototype.useCard = async function (player, card, targets) {
  targets = targets || [];

  if (card.type === 'basic') {
    if (card.basicKind === 'sha') {
      this.playCardFromHand(player, card);
      player._shaUsed = (player._shaUsed || 0) + 1;
      for (const t of targets) await this.resolveSha(player, t, card);
      return;
    }
    if (card.basicKind === 'tao') {
      // 出牌阶段回血
      this.playCardFromHand(player, card);
      if (player.hp < player.maxHp) { player.hp += 1; this.log(`${player.name} 使用「桃」回复 1 点体力`); }
      if (this.ui) this.ui.render();
      return;
    }
    return;
  }

  if (card.type === 'equip') {
    this.equipCard(player, card);
    return;
  }

  if (card.type === 'trick') {
    if (card.trickKind === 'delayed') {
      await this.useDelayedTrick(player, card, targets);
      return;
    }
    await this.useInstantTrick(player, card, targets);
    return;
  }
};

Game.prototype.equipCard = function (player, card) {
  this.removeFromHand(player, card);
  const slotMap = { weapon: 'weapon', armor: 'armor', horsePlus: 'horsePlus', horseMinus: 'horseMinus' };
  const slot = slotMap[card.equipKind];
  if (player.equip[slot]) this.discardCardObj(player.equip[slot]);
  player.equip[slot] = card;
  this.log(`${player.name} 装备了「${card.name}」`);
  if (this.ui) this.ui.render();
};

/* 延时锦囊：紧箍咒 / 天雷 */
Game.prototype.useDelayedTrick = async function (player, card, targets) {
  const target = targets[0] || player;
  this.removeFromHand(player, card);
  target.judgeZone.push(card);
  this.log(`${player.name} 将【${card.name}】置于 ${target.name} 的判定区`);
  if (this.ui) this.ui.render();
};

/* 即时锦囊结算 */
Game.prototype.useInstantTrick = async function (player, card, targets) {
  this.playCardFromHand(player, card);
  this.log(`${player.name} 使用了【${card.name}】`);

  switch (card.key) {
    case 'huazhai': // 无中生有
      this.draw(player, 2);
      break;

    case 'doufa': { // 决斗
      const t = targets[0];
      if (await this.askWuxieChain(card, t, player)) break;
      await this.resolveDuel(player, t);
      break;
    }

    case 'shunshou': { // 顺手牵羊
      const t = targets[0];
      if (await this.askWuxieChain(card, t, player)) break;
      const stolen = await this.takeOneCardFrom(player, t, true);
      if (stolen) this.log(`${player.name} 顺手牵羊获得了 ${t.name} 一张牌`);
      break;
    }

    case 'chaiqiao': { // 过河拆桥
      const t = targets[0];
      if (await this.askWuxieChain(card, t, player)) break;
      const removed = await this.takeOneCardFrom(player, t, false);
      if (removed) this.log(`${player.name} 拆掉了 ${t.name} 一张牌`);
      break;
    }

    case 'pantao': { // 桃园结义：所有存活角色回血
      for (const p of this.players.filter(x => x.alive)) {
        if (await this.askWuxieChain(card, p, player)) continue;
        if (p.hp < p.maxHp) { p.hp += 1; this.log(`${p.name} 回复 1 点体力`); }
      }
      if (this.ui) this.ui.render();
      break;
    }

    case 'qunyao': { // 南蛮入侵：其他人需出杀
      for (const t of this.players.filter(x => x.alive && x !== player)) {
        if (await this.askWuxieChain(card, t, player)) continue;
        const sha = await this.requestBasicResponse(t, 'sha', `【群妖来袭】，${t.name} 需打出「杀」`);
        if (!sha) await this.dealDamage(player, t, 1, { tag: '' });
      }
      break;
    }

    case 'feisha': { // 万箭齐发：其他人需出闪
      for (const t of this.players.filter(x => x.alive && x !== player)) {
        if (await this.askWuxieChain(card, t, player)) continue;
        const shan = await this.requestBasicResponse(t, 'shan', `【飞沙走石】，${t.name} 需打出「闪」`);
        if (!shan) await this.dealDamage(player, t, 1, { tag: '' });
      }
      break;
    }
  }
};

/* 决斗结算：发起者 a 与 目标 b。目标先出「杀」，之后轮流；先打不出「杀」者受到伤害 */
Game.prototype.resolveDuel = async function (a, b) {
  let current = b;          // 当前需要打出「杀」的人（目标先）
  let other = a;            // 对手
  while (true) {
    const sha = await this.requestBasicResponse(current, 'sha', `【斗法】，${current.name} 需打出「杀」`);
    if (!sha) {
      // current 打不出杀，受到 other 造成的 1 点伤害
      await this.dealDamage(other, current, 1, { tag: '斗法' });
      return;
    }
    [current, other] = [other, current];
  }
};

/* 请求打出一张基本牌作为响应（杀/闪），返回是否打出 */
Game.prototype.requestBasicResponse = async function (player, basicKind, prompt) {
  const usable = this.findUsableBasic(player, basicKind);
  if (!usable.length) return false;
  let useIt;
  if (player.isHuman) {
    useIt = await this.ui.promptYesNo(player, prompt + '，是否打出？', {});
  } else {
    useIt = AI.decideBasicResponse(this, player, basicKind);
  }
  if (!useIt) return false;
  const card = player.isHuman
    ? await this.ui.promptCard(player, [basicKind], `选择「${basicKind === 'sha' ? '杀' : '闪'}」`, { asResp: basicKind })
    : usable[0];
  if (!card) return false;
  this.playCardFromHand(player, card);
  return true;
};

/* 顺手牵羊 / 过河拆桥：取走目标一张牌；steal=true 则归自己 */
Game.prototype.takeOneCardFrom = async function (actor, target, steal) {
  const pool = [];
  target.hand.forEach(c => pool.push({ zone: 'hand', card: c, label: '手牌' }));
  this.allEquipCards(target).forEach(c => pool.push({ zone: 'equip', card: c, label: c.name }));
  target.judgeZone.forEach(c => pool.push({ zone: 'judge', card: c, label: c.name }));
  if (!pool.length) return null;

  let pick;
  if (actor.isHuman) {
    pick = await this.ui.promptCardZone(target, pool, steal ? '选择获得的牌' : '选择弃置的牌');
  } else {
    pick = AI.chooseCardToTake(this, actor, target, pool);
  }
  if (!pick) pick = pool[0];

  this.removeCardFromZone(target, pick);
  if (steal) actor.hand.push(pick.card);
  else this.discardCardObj(pick.card);
  if (this.ui) this.ui.render();
  return pick.card;
};

/* ============================================================
 * 回合主流程
 * ============================================================ */
Game.prototype.runTurn = async function (player) {
  if (this.over) return;
  // 重置每回合标记
  player._shaUsed = 0;
  player._bruteUsed = false;
  player._sanmeiUsed = false;
  player._huashenUsed = false;

  this.log(`—— ${player.name}（${player.character.name}）的回合 ——`);

  // 1. 判定阶段
  await this.phaseJudge(player);
  if (!player.alive || this.over) return;

  // 紧箍咒可能跳过出牌阶段
  const skipPlay = player.flags.skipPlay;
  player.flags.skipPlay = false;

  // 2. 准备阶段技能（观音甘露）——简单处理
  // 3. 摸牌阶段
  await this.phaseDraw(player);
  if (this.over) return;

  // 4. 出牌阶段
  if (!skipPlay) {
    await this.phasePlay(player);
  } else {
    this.log(`${player.name} 被【紧箍咒】束缚，跳过出牌阶段`);
  }
  if (this.over) return;

  // 5. 弃牌阶段
  await this.phaseDiscard(player);
  if (player.character.onEndDiscard) player.character.onEndDiscard(this, player);
};

Game.prototype.phaseJudge = async function (player) {
  // 从最后置入的延时锦囊开始结算（后进先出）
  const zone = player.judgeZone.slice().reverse();
  for (const card of zone) {
    // 移出判定区
    const i = player.judgeZone.findIndex(c => c.uid === card.uid);
    if (i >= 0) player.judgeZone.splice(i, 1);

    if (card.key === 'tianlei') {
      const j = this.doJudge(player, '【天雷】');
      this.discardCardObj(card);
      if (j && j.suit === 'spade' && j.point >= 2 && j.point <= 9) {
        this.log(`天雷命中！`);
        await this.dealDamage(null, player, 3, { tag: '雷电' });
        if (!player.alive || this.over) return;
      } else {
        // 移交下家
        const next = this.nextAlive(player);
        if (next && next !== player) {
          const newCard = Object.assign({}, card);
          next.judgeZone.push(newCard);
          this.log(`天雷移交给 ${next.name}`);
        }
      }
    } else if (card.key === 'jingu') {
      const j = this.doJudge(player, '【紧箍咒】');
      this.discardCardObj(card);
      if (!(j && j.suit === 'heart')) {
        player.flags.skipPlay = true;
        this.log(`${player.name} 判定非红桃，将跳过出牌阶段`);
      } else {
        this.log(`${player.name} 判定为红桃，挣脱了紧箍咒`);
      }
    }
    if (this.ui) this.ui.render();
  }
};

Game.prototype.phaseDraw = async function (player) {
  let n = 2;
  if (player.character.extraDraw) n += player.character.extraDraw(player);
  this.draw(player, n);
};

Game.prototype.phasePlay = async function (player) {
  if (player.isHuman) {
    await this.ui.runHumanPlayPhase(player);
  } else {
    await AI.playPhase(this, player);
  }
};

Game.prototype.phaseDiscard = async function (player) {
  const limit = Math.max(player.hp, 0);
  while (player.hand.length > limit) {
    if (player.isHuman) {
      const card = await this.ui.promptDiscard(player, player.hand.length - limit);
      if (card) { this.playCardFromHand(player, card); }
      else break;
    } else {
      // AI 弃置价值最低的牌
      const card = AI.chooseDiscard(this, player);
      this.playCardFromHand(player, card);
    }
  }
  this.log(`${player.name} 结束回合`);
};

Game.prototype.nextAlive = function (player) {
  const n = this.players.length;
  let i = this.players.indexOf(player);
  for (let k = 1; k <= n; k++) {
    const p = this.players[(i + k) % n];
    if (p.alive) return p;
  }
  return null;
};

/* 主循环 */
Game.prototype.run = async function () {
  while (!this.over) {
    const player = this.players[this.turnIndex];
    if (player.alive) {
      await this.runTurn(player);
    }
    if (this.over) break;
    // 下一个存活玩家
    let next = this.turnIndex;
    do { next = (next + 1) % this.players.length; }
    while (!this.players[next].alive);
    this.turnIndex = next;
  }
};
