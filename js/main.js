/* ============================================================
 * 西游杀 - 启动与开始界面
 * ============================================================ */

let UI_INSTANCE = null;

function startScreen() {
  const start = document.getElementById('start-screen');
  const grid = document.getElementById('char-grid');
  const numSel = document.getElementById('num-players');

  grid.innerHTML = '';
  let chosenId = null;

  CHARACTERS.forEach(c => {
    const div = document.createElement('div');
    div.className = 'char-pick';
    div.innerHTML = `
      <div class="cp-avatar">${c.avatar}</div>
      <div class="cp-name">${c.name}</div>
      <div class="cp-title">${c.title}</div>
      <div class="cp-hp">体力 ${c.maxHp}</div>
      <div class="cp-skill">【${c.skillName}】</div>
      <div class="cp-desc">${c.skillDesc}</div>`;
    div.onclick = () => {
      chosenId = c.id;
      [...grid.children].forEach(ch => ch.classList.remove('selected'));
      div.classList.add('selected');
    };
    grid.appendChild(div);
  });

  document.getElementById('btn-start').onclick = () => {
    if (!chosenId) { alert('请先选择一个出场武将'); return; }
    const n = parseInt(numSel.value, 10);
    start.style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    launchGame(chosenId, n);
  };

  document.getElementById('btn-random').onclick = () => {
    const n = parseInt(numSel.value, 10);
    const rand = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
    start.style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    launchGame(rand, n);
  };
}

async function launchGame(charId, numPlayers) {
  const ui = new UI();
  ui.speed = 0.5; // 默认中速（已整体放慢一倍）
  UI_INSTANCE = ui;
  window.UI_INSTANCE = ui;
  const game = new Game({ ui, numPlayers });
  ui.bind(game);
  game.setup(charId);
  ui.render();

  // 显示玩家身份提示
  const me = game.players[0];
  setTimeout(() => {
    ui.openModal(
      `<h3>你的身份：<span style="color:${IDENTITY[me.identity].color}">${IDENTITY[me.identity].name}</span></h3>
       <p style="font-size:13px;line-height:1.6">${identityGoal(me.identity)}</p>
       <p style="font-size:13px">出场武将：${me.character.avatar} ${me.character.name}·${me.character.title}<br>
       【${me.character.skillName}】${me.character.skillDesc}</p>`,
      [{ label: '开始游戏', cls: 'yes', onClick: () => {
        ui.closeModal();
        // 在用户手势内解锁音频并启动背景乐
        SFX.unlock();
        if (SFX.musicEnabled) SFX.startBgm();
        game.run();
      } }]
    );
  }, 200);
}

/* ---------------- 牌库说明（卡牌属性总览） ----------------
 * 任何时候点 📖 都能查看所有牌的效果。
 */
function cardKindLabel(c) {
  if (c.type === 'basic') return '基本牌';
  if (c.type === 'equip') {
    return { weapon: '武器', armor: '防具', horsePlus: '+1坐骑', horseMinus: '-1坐骑' }[c.equipKind];
  }
  return c.trickKind === 'delayed' ? '延时锦囊' : '锦囊牌';
}

function showCardGuide() {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  if (!modal || !body) return;
  // 若已有弹窗（例如游戏中的询问），不打断
  if (modal.style.display === 'flex') return;

  const byKey = {};
  CARD_TEMPLATES.forEach(t => byKey[t.key] = t);

  const groups = [
    { title: '🎴 基本牌', keys: ['sha', 'shan', 'tao'] },
    { title: '📜 锦囊牌', keys: ['huazhai', 'doufa', 'shunshou', 'chaiqiao', 'pantao', 'qunyao', 'feisha', 'wuxie', 'jingu', 'tianlei'] },
    { title: '⚔️ 装备牌', keys: ['jingubang', 'dingpa', 'baozhang', 'lianhuajia', 'mawang', 'huoyan'] },
  ];

  let html = '<h3>牌库说明</h3>'
    + '<div style="text-align:left;max-height:58vh;overflow-y:auto;padding-right:4px">';
  for (const grp of groups) {
    html += `<div style="color:#e8c873;font-weight:700;margin:12px 0 4px;font-size:14px">${grp.title}</div>`;
    for (const k of grp.keys) {
      const t = byKey[k];
      if (!t) continue;
      html += `<div style="margin:6px 0;line-height:1.5">
        <b style="font-size:14px">${t.name}</b>
        <span style="color:#9c8c6e;font-size:11px"> · ${cardKindLabel(t)}</span><br>
        <span style="color:#cbb98e;font-size:12px">${t.desc}</span></div>`;
    }
  }
  html += '</div>';

  body.innerHTML = html;
  const wrap = document.createElement('div');
  wrap.className = 'modal-btns';
  const btn = document.createElement('button');
  btn.className = 'btn yes';
  btn.textContent = '关闭';
  btn.onclick = () => { modal.style.display = 'none'; };
  wrap.appendChild(btn);
  body.appendChild(wrap);
  modal.style.display = 'flex';
}

function identityGoal(id) {
  switch (id) {
    case 'zhugong': return '你是主公（唐三藏）。消灭所有反贼与内奸，护送取经队取得真经！';
    case 'zhongchen': return '你是忠臣。誓死保护主公，消灭所有反贼与内奸。';
    case 'fanzei': return '你是反贼（妖魔）。击杀主公即可获胜！';
    case 'neijian': return '你是内奸。先除掉其他人，最后与主公单挑并取胜，方能独存。';
  }
  return '';
}

window.addEventListener('DOMContentLoaded', startScreen);
