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
  UI_INSTANCE = ui;
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
      [{ label: '开始游戏', cls: 'yes', onClick: () => { ui.closeModal(); game.run(); } }]
    );
  }, 200);
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
