/* ============================================================
 * 西游杀 - AI 决策模块
 * 采用基于身份的启发式：判断敌我、合理使用牌、保命
 * ============================================================ */

const AI = {
  /* ---------- 敌我关系 ----------
   * 返回 'enemy' | 'ally' | 'neutral'
   * 信息不完全：主公公开，攻击过主公者(exposed)视为反贼倾向
   */
  relation(g, me, other) {
    if (me === other) return 'self';
    const myId = me.identity, oId = other.identity;

    if (myId === 'zhugong') {
      if (oId === 'zhongchen') return 'ally';
      if (other.exposed) return 'enemy';
      // 未知者：反贼/内奸为敌，但信息不全 -> 倾向中立偏敌
      return oId === 'fanzei' || oId === 'neijian' ? 'enemy' : 'neutral';
    }
    if (myId === 'zhongchen') {
      if (oId === 'zhugong') return 'ally';
      if (other.exposed) return 'enemy';
      return (oId === 'fanzei' || oId === 'neijian') ? 'enemy' : 'neutral';
    }
    if (myId === 'fanzei') {
      if (oId === 'zhugong') return 'enemy';
      if (oId === 'fanzei') return 'ally';
      // 忠臣/内奸：忠臣是敌，内奸暂中立
      if (oId === 'zhongchen') return 'enemy';
      return 'neutral';
    }
    if (myId === 'neijian') {
      // 内奸：先帮反贼除忠臣，留主公最后；忠臣是敌
      if (oId === 'zhugong') {
        // 主公血少时也想留着单挑，前期视为需保护对象 -> neutral
        return 'neutral';
      }
      if (oId === 'zhongchen') return 'enemy';
      if (oId === 'fanzei') return 'enemy'; // 最终要清场
      return 'neutral';
    }
    return 'neutral';
  },

  enemies(g, me) {
    return g.players.filter(p => p.alive && this.relation(g, me, p) === 'enemy');
  },

  /* ---------- 出牌阶段 ---------- */
  async playPhase(g, me) {
    let acted = true;
    let safety = 0;
    while (acted && !g.over && me.alive && safety++ < 30) {
      acted = false;

      // 1) 装备武器/坐骑（提升能力）
      const equip = me.hand.find(c => c.type === 'equip' && this.wantEquip(g, me, c));
      if (equip) { await this.aiAct(g, me, equip); acted = true; continue; }

      // 2) 化斋（无中生有）手牌不多时
      const huazhai = me.hand.find(c => c.key === 'huazhai');
      if (huazhai && me.hand.length <= 4) { await this.aiAct(g, me, huazhai, [me]); acted = true; continue; }

      // 3) 受伤且有桃，先回血到安全线
      const tao = me.hand.find(c => c.basicKind === 'tao');
      if (tao && me.hp < Math.min(2, me.maxHp)) { await this.aiAct(g, me, tao); acted = true; continue; }

      // 4) AOE：群妖来袭 / 飞沙走石（敌多于友时）
      const aoe = me.hand.find(c => c.key === 'qunyao' || c.key === 'feisha');
      if (aoe && this.aoeWorthIt(g, me)) { await this.aiAct(g, me, aoe); acted = true; continue; }

      // 5) 顺手牵羊 / 过河拆桥 对敌人
      const disrupt = me.hand.find(c => c.key === 'shunshou' || c.key === 'chaiqiao');
      if (disrupt) {
        const t = this.pickDisruptTarget(g, me, disrupt);
        if (t) { await this.aiAct(g, me, disrupt, [t]); acted = true; continue; }
      }

      // 6) 紧箍咒 对敌人
      const jingu = me.hand.find(c => c.key === 'jingu');
      if (jingu) {
        const t = this.enemies(g, me).find(e => !e.judgeZone.some(z => z.key === 'jingu'));
        if (t) { await this.aiAct(g, me, jingu, [t]); acted = true; continue; }
      }

      // 7) 斗法 对敌人（手里杀多时）
      const doufa = me.hand.find(c => c.key === 'doufa');
      const shaCount = me.hand.filter(c => c.basicKind === 'sha').length;
      if (doufa && shaCount >= 1) {
        const t = this.enemies(g, me).sort((a, b) => a.hp - b.hp)[0];
        if (t) { await this.aiAct(g, me, doufa, [t]); acted = true; continue; }
      }

      // 8) 杀：攻击范围内的敌人
      const sha = me.hand.find(c => c.basicKind === 'sha');
      const canSha = sha && (me._shaUsed < 1 || (me.character.extraShaCount && me._shaUsed < me.character.extraShaCount(me)));
      if (canSha) {
        const targets = this.enemies(g, me)
          .filter(e => g.inAttackRange(me, e))
          .sort((a, b) => a.hp - b.hp);
        if (targets.length) { await this.aiAct(g, me, sha, [targets[0]]); acted = true; continue; }
      }

      // 9) 天雷给自己上（黑桃概率赌博）——一般丢给下家，简单处理：直接放自己很危险，跳过
    }
  },

  /* AI 执行一次出牌：先飞牌+播报+停顿，让玩家看清，再结算 */
  async aiAct(g, me, card, targets) {
    targets = targets || [];
    if (g.ui) {
      const tname = targets.length && targets[0] !== me ? ` ➜ ${targets[0].name}` : '';
      g.ui.flyCardFromPlayer(me, card, targets[0] || null);
      g.ui.showAction(`${me.name}：${card.name}${tname}`, card);
      await g.pause(1150);
    }
    await g.useCard(me, card, targets);
    if (g.ui) await g.pause(650);
  },


  wantEquip(g, me, card) {
    if (card.equipKind === 'weapon') {
      // 想要更大范围的武器
      const cur = me.equip.weapon ? me.equip.weapon.range : 1;
      return card.range > cur;
    }
    if (card.equipKind === 'armor') return !me.equip.armor;
    if (card.equipKind === 'horseMinus') return !me.equip.horseMinus;
    if (card.equipKind === 'horsePlus') return !me.equip.horsePlus;
    return false;
  },

  aoeWorthIt(g, me) {
    const enemies = this.enemies(g, me).length;
    const allies = g.players.filter(p => p.alive && this.relation(g, me, p) === 'ally').length;
    // 敌人明显多，且自己血量尚可
    return enemies >= 1 && enemies > allies && me.hp >= 2;
  },

  pickDisruptTarget(g, me, card) {
    let cands = this.enemies(g, me).filter(e => e.hand.length || g.hasEquip(e) || e.judgeZone.length);
    if (card.range1) cands = cands.filter(e => g.distance(me, e) <= 1);
    cands.sort((a, b) => (g.hasEquip(b) ? 1 : 0) - (g.hasEquip(a) ? 1 : 0));
    return cands[0] || null;
  },

  /* ---------- 响应类决策 ---------- */
  decideShan(g, me, source) {
    // 几乎总是闪（除非闪很多且血量充足，可留着，但简单起见总是闪）
    return true;
  },

  decideBasicResponse(g, me, basicKind) {
    return true; // 有就出（应对 AOE/决斗）
  },

  decideWuxie(g, me, originCard, target, source, alreadyNegated) {
    // 若该锦囊对“我方”有害且我有无懈，则使用
    const harmful = ['doufa', 'shunshou', 'chaiqiao', 'qunyao', 'feisha', 'jingu'];
    if (!harmful.includes(originCard.key)) {
      // 桃园/化斋等增益：若正被无懈(negated)，可反无懈帮友方
      if (originCard.key === 'pantao' && alreadyNegated) {
        // 友方受益被取消，帮忙反无懈
        return this.relation(g, me, source) === 'ally' && Math.random() < 0.5;
      }
      return false;
    }
    if (!target) return false;
    const rel = this.relation(g, me, target);
    if (alreadyNegated) {
      // 已被无懈一次（即将不生效）：若目标是敌人则再无懈让它生效
      return rel === 'enemy' && Math.random() < 0.4;
    }
    // 目标是自己或友方 -> 无懈保护
    if (target === me) return true;
    if (rel === 'ally') return Math.random() < 0.7;
    return false;
  },

  decidePeachSave(g, me, dying) {
    if (me === dying) return true; // 自救
    const rel = this.relation(g, me, dying);
    if (rel === 'ally') return true;
    // 主公救忠臣、忠臣救主公已含在 ally
    return false;
  },

  shouldBruteForce(g, me, target) {
    // 能击杀或对方血少时发动
    return target.hp <= 2 && me.hand.length >= 2;
  },

  /* ---------- 选择目标（通用） ---------- */
  chooseTarget(g, me, candidates, prompt) {
    const enemies = candidates.filter(c => this.relation(g, me, c) === 'enemy');
    const pool = enemies.length ? enemies : candidates;
    return pool.sort((a, b) => a.hp - b.hp)[0];
  },

  chooseCardToTake(g, me, target, pool) {
    // 优先拿/拆装备，其次判定区（拆掉对敌不利的延时锦囊则对己有利？这里简单拿装备或手牌）
    const equip = pool.find(p => p.zone === 'equip');
    if (equip) return equip;
    const hand = pool.find(p => p.zone === 'hand');
    return hand || pool[0];
  },

  chooseDiscard(g, me) {
    // 价值排序，弃最低价值
    const valued = me.hand.slice().sort((a, b) => this.cardValue(a) - this.cardValue(b));
    return valued[0];
  },

  cardValue(c) {
    if (c.basicKind === 'tao') return 10;
    if (c.basicKind === 'sha') return 6;
    if (c.basicKind === 'shan') return 5;
    if (c.key === 'wuxie') return 7;
    if (c.type === 'equip') return 4;
    if (c.type === 'trick') return 5;
    return 3;
  },

  /* respondCard / respondYesNo 兜底（一般不会走到） */
  respondCard(g, me, kinds) {
    for (const k of kinds) {
      const c = g.findUsableBasic(me, k)[0];
      if (c) return c;
    }
    return null;
  },
  respondYesNo() { return true; },
};
