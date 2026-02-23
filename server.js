'use strict';
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e5,
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// index.html lives in the repo root (same dir as server.js), not in a /public subfolder
app.use(express.static(__dirname));
app.get('/health', (_, res) => res.send('ok'));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Room registry ──────────────────────────────────────────────
const rooms = {};
// nextRoundReady lives outside connection scope so it persists across events
const nextRoundReady = {};

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
function uniqueCode() {
  let c, tries = 0;
  do { c = makeCode(); tries++; } while (rooms[c] && tries < 100);
  return c;
}

// ── Card definitions ───────────────────────────────────────────
const CARD_DEFS = [
  // Northern Realms – heroes
  {id:'geralt',      name:'Geralt of Rivia',   faction:'northern', type:'unit', subtype:'hero',   row:'close',  power:15, ability:null,             emoji:'⚔️'},
  {id:'triss',       name:'Triss Merigold',    faction:'northern', type:'unit', subtype:'hero',   row:'ranged', power:7,  ability:'morale_boost',   emoji:'🌙'},
  {id:'ciri',        name:'Cirilla',           faction:'northern', type:'unit', subtype:'hero',   row:'close',  power:15, ability:null,             emoji:'🌟'},
  {id:'dandelion',   name:'Dandelion',         faction:'northern', type:'unit', subtype:'hero',   row:'ranged', power:2,  ability:'commanders_horn',emoji:'🎵'},
  // Northern Realms – units
  {id:'zoltan',      name:'Zoltan Chivay',     faction:'northern', type:'unit', subtype:'normal', row:'close',  power:5,  ability:null,             emoji:'🪓'},
  {id:'ves',         name:'Ves',               faction:'northern', type:'unit', subtype:'normal', row:'close',  power:5,  ability:'tight_bond',     emoji:'🗡️'},
  {id:'yarpen',      name:'Yarpen Zigrin',     faction:'northern', type:'unit', subtype:'normal', row:'close',  power:2,  ability:'tight_bond',     emoji:'⛏️'},
  {id:'natalis',     name:'John Natalis',      faction:'northern', type:'unit', subtype:'normal', row:'close',  power:10, ability:null,             emoji:'👑'},
  {id:'mahakam',     name:'Mahakam Guard',     faction:'northern', type:'unit', subtype:'normal', row:'close',  power:5,  ability:'tight_bond',     emoji:'🛡️'},
  {id:'blue_stripes',name:'Blue Stripes',      faction:'northern', type:'unit', subtype:'normal', row:'close',  power:4,  ability:'tight_bond',     emoji:'💙'},
  {id:'keira',       name:'Keira Metz',        faction:'northern', type:'unit', subtype:'normal', row:'ranged', power:5,  ability:'medic',          emoji:'💎'},
  {id:'philippa',    name:'Philippa Eilhart',  faction:'northern', type:'unit', subtype:'normal', row:'ranged', power:10, ability:null,             emoji:'🦅'},
  {id:'catapult',    name:'Catapult',          faction:'northern', type:'unit', subtype:'normal', row:'siege',  power:8,  ability:'tight_bond',     emoji:'🪨'},
  {id:'ballista',    name:'Ballista',          faction:'northern', type:'unit', subtype:'normal', row:'siege',  power:10, ability:null,             emoji:'🏹'},
  {id:'nr_scout',    name:'Scout',             faction:'northern', type:'unit', subtype:'agile',  row:'agile',  power:6,  ability:null,             emoji:'🏃'},
  {id:'spy_nr',      name:'Foltest Spy',       faction:'northern', type:'unit', subtype:'spy',    row:'close',  power:6,  ability:'spy',            emoji:'🕵️'},
  {id:'schirru',     name:'Schirru',           faction:'northern', type:'unit', subtype:'normal', row:'ranged', power:5,  ability:'muster',         emoji:'🎯'},
  // Nilfgaard – heroes
  {id:'gaunter',     name:"Gaunter O'Dimm",    faction:'nilfgaard',type:'unit', subtype:'hero',   row:'close',  power:6,  ability:'spy',            emoji:'⏳'},
  {id:'emhyr',       name:'Emhyr var Emreis',  faction:'nilfgaard',type:'unit', subtype:'hero',   row:'close',  power:12, ability:null,             emoji:'👁️'},
  {id:'yennefer',    name:'Yennefer',          faction:'nilfgaard',type:'unit', subtype:'hero',   row:'ranged', power:7,  ability:'medic',          emoji:'✨'},
  {id:'vilgefortz',  name:'Vilgefortz',        faction:'nilfgaard',type:'unit', subtype:'hero',   row:'ranged', power:4,  ability:null,             emoji:'🔮'},
  // Nilfgaard – units
  {id:'cahir',       name:'Cahir Mawr',        faction:'nilfgaard',type:'unit', subtype:'normal', row:'close',  power:6,  ability:'morale_boost',   emoji:'🛡️'},
  {id:'auckes',      name:'Auckes',            faction:'nilfgaard',type:'unit', subtype:'normal', row:'close',  power:5,  ability:'tight_bond',     emoji:'⚔️'},
  {id:'morteisen',   name:'Morteisen',         faction:'nilfgaard',type:'unit', subtype:'normal', row:'close',  power:3,  ability:'tight_bond',     emoji:'🗡️'},
  {id:'stefan',      name:'Stefan Skellen',    faction:'nilfgaard',type:'unit', subtype:'spy',    row:'close',  power:9,  ability:'spy',            emoji:'🕵️'},
  {id:'puttkammer',  name:'Puttkammer',        faction:'nilfgaard',type:'unit', subtype:'normal', row:'ranged', power:3,  ability:'tight_bond',     emoji:'🎯'},
  {id:'vreemde',     name:'Vreemde',           faction:'nilfgaard',type:'unit', subtype:'normal', row:'ranged', power:6,  ability:null,             emoji:'🏹'},
  {id:'nauzicaa',    name:'Nauzicaa Sgt',      faction:'nilfgaard',type:'unit', subtype:'agile',  row:'agile',  power:4,  ability:'muster',         emoji:'🔱'},
  {id:'siege_eng',   name:'Siege Engineer',    faction:'nilfgaard',type:'unit', subtype:'normal', row:'siege',  power:6,  ability:null,             emoji:'🏗️'},
  {id:'spy_nilf',    name:'Imperial Spy',      faction:'nilfgaard',type:'unit', subtype:'spy',    row:'close',  power:7,  ability:'spy',            emoji:'🕵️'},
  // Neutral specials
  {id:'frost',    name:'Biting Frost',     faction:'neutral',type:'weather', subtype:'weather',row:'close',  power:0, ability:'weather_close',  emoji:'❄️'},
  {id:'fog',      name:'Impenetrable Fog', faction:'neutral',type:'weather', subtype:'weather',row:'ranged', power:0, ability:'weather_ranged', emoji:'🌫️'},
  {id:'rain',     name:'Torrential Rain',  faction:'neutral',type:'weather', subtype:'weather',row:'siege',  power:0, ability:'weather_siege',  emoji:'🌧️'},
  {id:'sun',      name:'Clear Weather',    faction:'neutral',type:'special', subtype:'clear',  row:null,     power:0, ability:'clear_weather',  emoji:'☀️'},
  {id:'cmd_horn', name:"Commander's Horn", faction:'neutral',type:'special', subtype:'horn',   row:null,     power:0, ability:'commanders_horn',emoji:'📯'},
  {id:'scorch',   name:'Scorch',           faction:'neutral',type:'special', subtype:'scorch', row:null,     power:0, ability:'scorch',          emoji:'🔥'},
  {id:'decoy',    name:'Decoy',            faction:'neutral',type:'special', subtype:'decoy',  row:null,     power:0, ability:'decoy',           emoji:'🎭'},
];

const CMAP = {};
CARD_DEFS.forEach(c => { CMAP[c.id] = c; });

function uid() { return Math.random().toString(36).substr(2, 9); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = 0 | Math.random() * (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(faction) {
  const deck = [];
  CARD_DEFS.filter(c => c.faction === faction).forEach(c => {
    deck.push({ ...c, uid: uid() });
    if (c.ability === 'tight_bond' || c.ability === 'muster') {
      deck.push({ ...c, uid: uid() });
    }
  });
  ['frost','fog','rain','sun','cmd_horn','scorch','decoy'].forEach(id => {
    deck.push({ ...CMAP[id], uid: uid() });
  });
  return shuffle(deck);
}

// ── Game state factory ─────────────────────────────────────────
function newGameState(p1id, p2id) {
  const factions = shuffle(['northern','nilfgaard']);
  const f1 = factions[0], f2 = factions[1];
  const d1 = buildDeck(f1);
  const d2 = buildDeck(f2);
  // Draw 10 starting cards each; remaining deck stays as draw pile
  const h1 = [], h2 = [];
  for (let i = 0; i < 10 && d1.length; i++) h1.push(d1.pop());
  for (let i = 0; i < 10 && d2.length; i++) h2.push(d2.pop());

  return {
    round: 1,
    turn: p1id,
    phase: 'playing',
    weather: { close: false, ranged: false, siege: false },
    roundResult: null,
    awaitMedicSide: null,
    log: [],
    p1: { id: p1id, faction: f1, deck: d1, hand: h1, board:{close:[],ranged:[],siege:[]}, horn:{close:false,ranged:false,siege:false}, gy:[], passed:false, rw:0, redrawsLeft:2 },
    p2: { id: p2id, faction: f2, deck: d2, hand: h2, board:{close:[],ranged:[],siege:[]}, horn:{close:false,ranged:false,siege:false}, gy:[], passed:false, rw:0, redrawsLeft:2 },
  };
}

// ── Scoring ────────────────────────────────────────────────────
function effPwr(card, row, boardRow, weatherState) {
  if (!card || card.type !== 'unit') return 0;
  // Spies placed on opp's board do count for whoever's board they're on (they boost opp score)
  let base = card.power || 0;
  const isHero = card.subtype === 'hero';
  if (weatherState[row] && !isHero) base = 1;
  if (!isHero && card.ability === 'tight_bond') {
    const ct = boardRow.filter(c => c.id === card.id).length;
    if (ct > 1) base *= ct;
  }
  const mb = boardRow.filter(c => c.ability === 'morale_boost' && c.uid !== card.uid && (c.subtype === 'hero' || !weatherState[row])).length;
  base += mb;
  return Math.max(0, base);
}

function rowScore(pData, row, weatherState) {
  const cards = pData.board[row] || [];
  if (!cards.length) return 0;
  let t = 0;
  cards.forEach(c => { t += effPwr(c, row, cards, weatherState); });
  if (pData.horn[row]) t *= 2;
  return t;
}

function totalScore(pData, weatherState) {
  return rowScore(pData,'close',weatherState) + rowScore(pData,'ranged',weatherState) + rowScore(pData,'siege',weatherState);
}

// ── State broadcast (server-authoritative, hide opp hand) ──────
function broadcastState(room) {
  const gs = room.state;
  if (!gs) return;
  ['p1','p2'].forEach(pk => {
    const me = gs[pk], opp = gs[pk==='p1'?'p2':'p1'];
    io.to(me.id).emit('state', {
      round: gs.round, turn: gs.turn, phase: gs.phase,
      weather: gs.weather,
      myFaction: me.faction, oppFaction: opp.faction,
      myHand: me.hand,
      myBoard: me.board, oppBoard: opp.board,
      myHorn: me.horn,   oppHorn: opp.horn,
      myGY: me.gy,       oppGY: opp.gy,
      myPassed: me.passed, oppPassed: opp.passed,
      myRW: me.rw,         oppRW: opp.rw,
      myDeckCount: me.deck.length,
      oppHandCount: opp.hand.length,
      oppDeckCount: opp.deck.length,
      myRedrawsLeft: me.redrawsLeft,
      myScore: totalScore(me, gs.weather),
      oppScore: totalScore(opp, gs.weather),
      awaitMedic: gs.awaitMedicSide === pk,
      log: gs.log.slice(-12),
    });
  });
}

function broadcastRoundResult(room) {
  room.sockets.forEach(sid => io.to(sid).emit('round_result', room.state.roundResult));
}

// ── Log helper ─────────────────────────────────────────────────
function addLog(gs, msg, important) {
  gs.log.push({ msg, round: gs.round, important: !!important });
  if (gs.log.length > 150) gs.log.shift();
}

// ── Game helpers ───────────────────────────────────────────────
function getPS(gs, sid) {
  if (gs.p1.id === sid) return { me: gs.p1, opp: gs.p2, myKey: 'p1' };
  if (gs.p2.id === sid) return { me: gs.p2, opp: gs.p1, myKey: 'p2' };
  return null;
}

function drawCards(player, n) {
  for (let i = 0; i < n && player.deck.length; i++) player.hand.push(player.deck.pop());
}

function doScorch(gs) {
  let maxP = 0;
  const targets = [];
  ['close','ranged','siege'].forEach(row => {
    ['p1','p2'].forEach(pk => {
      (gs[pk].board[row] || []).forEach(c => {
        if (c.subtype !== 'hero' && c.type === 'unit') {
          const p = effPwr(c, row, gs[pk].board[row], gs.weather);
          targets.push({ c, pk, row, p });
          if (p > maxP) maxP = p;
        }
      });
    });
  });
  if (maxP === 0) return 0;
  let killed = 0;
  targets.filter(t => t.p === maxP).forEach(({ c, pk, row }) => {
    gs[pk].board[row] = gs[pk].board[row].filter(x => x.uid !== c.uid);
    gs[pk].gy.push(c);
    killed++;
  });
  addLog(gs, `🔥 Scorch! ${killed} unit(s) with power ${maxP} burned!`, true);
  return killed;
}

function doMuster(gs, pk, card, row) {
  const player = gs[pk];
  let ct = 0;
  const fromDeck = player.deck.filter(c => c.id === card.id);
  fromDeck.forEach(c => {
    player.deck.splice(player.deck.indexOf(c), 1);
    player.board[row].push(c);
    ct++;
  });
  const fromHand = player.hand.filter(c => c.id === card.id && c.uid !== card.uid);
  fromHand.forEach(c => {
    player.hand.splice(player.hand.indexOf(c), 1);
    player.board[row].push(c);
    ct++;
  });
  if (ct > 0) addLog(gs, `⚡ Muster! ${ct} extra ${card.name} summoned!`, true);
}

// ── Core play action ───────────────────────────────────────────
function processPlay(gs, sid, action) {
  const ps = getPS(gs, sid);
  if (!ps) return false;
  const { me, opp, myKey } = ps;
  if (gs.turn !== sid) return false;
  if (me.passed) return false;
  if (gs.phase !== 'playing') return false;

  const { cardUid, targetRow } = action;
  const cardIdx = me.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return false;
  const card = me.hand[cardIdx];

  function removeCard() { me.hand.splice(cardIdx, 1); }

  // ── Weather cards
  if (card.type === 'weather') {
    removeCard();
    const rowMap = { weather_close:'close', weather_ranged:'ranged', weather_siege:'siege' };
    const r = rowMap[card.ability];
    if (r) gs.weather[r] = card.ability;
    addLog(gs, `🌩️ ${card.name} played!`, true);
    advanceTurn(gs); return true;
  }

  // ── Clear weather
  if (card.subtype === 'clear') {
    removeCard();
    gs.weather = { close: false, ranged: false, siege: false };
    addLog(gs, '☀️ Clear Weather! All weather removed.', true);
    advanceTurn(gs); return true;
  }

  // ── Scorch
  if (card.subtype === 'scorch') {
    removeCard();
    doScorch(gs);
    advanceTurn(gs); return true;
  }

  // ── Commander's Horn
  if (card.subtype === 'horn') {
    const row = targetRow;
    if (!row || !['close','ranged','siege'].includes(row)) return false;
    if (me.horn[row]) return false;
    removeCard();
    me.horn[row] = true;
    addLog(gs, `📯 Commander's Horn on ${row.toUpperCase()} row!`, true);
    advanceTurn(gs); return true;
  }

  // ── Spy
  if (card.subtype === 'spy') {
    const r = card.row || 'close';
    removeCard();
    opp.board[r].push(card);
    drawCards(me, 2);
    addLog(gs, `🕵️ Spy placed! You drew 2 cards.`, true);
    advanceTurn(gs); return true;
  }

  // ── Decoy (targetRow = uid of board card to retrieve)
  if (card.subtype === 'decoy') {
    const targetUid = targetRow;
    if (!targetUid) return false;
    let found = null, foundRow = null;
    ['close','ranged','siege'].forEach(r => {
      const i = me.board[r].findIndex(c => c.uid === targetUid && c.subtype !== 'hero');
      if (i !== -1) { found = me.board[r].splice(i, 1)[0]; foundRow = r; }
    });
    if (!found) return false;
    removeCard();
    me.hand.push(found);
    addLog(gs, `🎭 Decoy! ${found.name} returned to hand.`, true);
    advanceTurn(gs); return true;
  }

  // ── Agile unit
  if (card.subtype === 'agile') {
    const row = targetRow;
    if (!row || !['close','ranged'].includes(row)) return false;
    removeCard();
    me.board[row].push(card);
    addLog(gs, `▶ ${card.name} → ${row.toUpperCase()}`, false);
    if (card.ability === 'muster') doMuster(gs, myKey, card, row);
    if (card.ability === 'medic') {
      const eligible = me.gy.filter(c => c.type === 'unit' && c.subtype !== 'hero' && c.subtype !== 'spy');
      if (eligible.length > 0) { gs.awaitMedicSide = myKey; return true; }
    }
    advanceTurn(gs); return true;
  }

  // ── Normal unit
  const row = targetRow || card.row;
  if (!row || !['close','ranged','siege'].includes(row)) return false;
  if (row !== card.row) return false;
  removeCard();
  me.board[row].push(card);
  addLog(gs, `▶ ${card.name} → ${row.toUpperCase()}`, false);
  if (card.ability === 'muster') doMuster(gs, myKey, card, row);
  if (card.ability === 'medic') {
    const eligible = me.gy.filter(c => c.type === 'unit' && c.subtype !== 'hero' && c.subtype !== 'spy');
    if (eligible.length > 0) { gs.awaitMedicSide = myKey; return true; }
  }
  advanceTurn(gs); return true;
}

function advanceTurn(gs) {
  if (gs.p1.passed && gs.p2.passed) { resolveRound(gs); return; }
  const next = gs.turn === gs.p1.id ? 'p2' : 'p1';
  if (!gs[next].passed) gs.turn = gs[next].id;
  // else: current player still goes (other passed)
}

function resolveRound(gs) {
  gs.phase = 'resolving';
  const p1s = totalScore(gs.p1, gs.weather);
  const p2s = totalScore(gs.p2, gs.weather);
  let winner;
  if (p1s > p2s) { winner = 'p1'; gs.p1.rw++; }
  else if (p2s > p1s) { winner = 'p2'; gs.p2.rw++; }
  else { winner = 'tie'; gs.p1.rw++; gs.p2.rw++; }
  gs.history = gs.history || [];
  gs.history.push({ round: gs.round, p1s, p2s, winner });
  addLog(gs, `━━ Round ${gs.round}: ${p1s} vs ${p2s} — ${winner==='tie'?'DRAW':winner.toUpperCase()+' WINS'} ━━`, true);

  // Clear boards to GY
  ['close','ranged','siege'].forEach(row => {
    gs.p1.gy.push(...gs.p1.board[row]); gs.p1.board[row] = [];
    gs.p2.gy.push(...gs.p2.board[row]); gs.p2.board[row] = [];
  });
  gs.weather = { close:false, ranged:false, siege:false };
  gs.p1.horn = { close:false, ranged:false, siege:false };
  gs.p2.horn = { close:false, ranged:false, siege:false };

  gs.roundResult = {
    round: gs.round, winner, p1s, p2s,
    gameOver: gs.p1.rw >= 2 || gs.p2.rw >= 2 || gs.round >= 3,
  };
}

function startNextRound(gs) {
  const last = gs.history[gs.history.length - 1];
  gs.round++;
  gs.p1.passed = false; gs.p2.passed = false;
  gs.awaitMedicSide = null;
  gs.phase = 'playing';
  gs.roundResult = null;
  // Draw cards: winner gets 2, loser gets 2, draw = 1 each
  if (last.winner === 'p1') { drawCards(gs.p1, 2); drawCards(gs.p2, 2); }
  else if (last.winner === 'p2') { drawCards(gs.p1, 2); drawCards(gs.p2, 2); }
  else { drawCards(gs.p1, 1); drawCards(gs.p2, 1); }
  // Loser (or p2 on tie) goes first
  gs.turn = last.winner === 'p1' ? gs.p2.id : gs.p1.id;
  addLog(gs, `⚔ Round ${gs.round} begins!`, true);
}

// ── Socket handlers ────────────────────────────────────────────
io.on('connection', socket => {
  console.log('+ connect', socket.id);

  socket.on('create_room', () => {
    const code = uniqueCode();
    rooms[code] = { p1: socket.id, p2: null, state: null, sockets: [socket.id] };
    socket.join(code);
    socket.data.room = code;
    socket.emit('room_created', { code });
    console.log('[room created]', code);
  });

  socket.on('join_room', ({ code }) => {
    const c = (code || '').toUpperCase().trim();
    const room = rooms[c];
    if (!room) { socket.emit('err', 'Room not found.'); return; }
    if (room.p2) { socket.emit('err', 'Room is full.'); return; }
    room.p2 = socket.id;
    room.sockets.push(socket.id);
    socket.join(c);
    socket.data.room = c;

    room.state = newGameState(room.p1, room.p2);
    const gs = room.state;
    console.log('[game start]', c);

    io.to(room.p1).emit('game_start', {
      yourFaction: gs.p1.faction, opponentFaction: gs.p2.faction,
      youGoFirst: gs.turn === room.p1,
    });
    io.to(room.p2).emit('game_start', {
      yourFaction: gs.p2.faction, opponentFaction: gs.p1.faction,
      youGoFirst: gs.turn === room.p2,
    });
    broadcastState(room);
  });

  socket.on('play_card', (action) => {
    const room = rooms[socket.data.room];
    if (!room?.state) return;
    const gs = room.state;
    if (gs.awaitMedicSide) return; // block play during medic pick
    const ok = processPlay(gs, socket.id, action);
    if (!ok) return;
    if (gs.phase === 'resolving') {
      broadcastState(room);
      broadcastRoundResult(room);
    } else {
      broadcastState(room);
    }
  });

  socket.on('pass_round', () => {
    const room = rooms[socket.data.room];
    if (!room?.state) return;
    const gs = room.state;
    const ps = getPS(gs, socket.id);
    if (!ps || gs.turn !== socket.id || ps.me.passed || gs.phase !== 'playing') return;
    ps.me.passed = true;
    addLog(gs, `${ps.myKey === 'p1' ? 'Player 1' : 'Player 2'} passed.`, true);
    if (ps.opp.passed) {
      resolveRound(gs);
      broadcastState(room);
      broadcastRoundResult(room);
    } else {
      gs.turn = ps.opp.id;
      broadcastState(room);
    }
  });

  socket.on('ready_next_round', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room?.state) return;
    const gs = room.state;
    if (!gs.roundResult || gs.roundResult.gameOver) return;
    if (!nextRoundReady[code]) nextRoundReady[code] = new Set();
    nextRoundReady[code].add(socket.id);
    if (nextRoundReady[code].size >= 2) {
      nextRoundReady[code].clear();
      startNextRound(gs);
      broadcastState(room);
    }
  });

  socket.on('medic_pick', ({ cardUid }) => {
    const room = rooms[socket.data.room];
    if (!room?.state) return;
    const gs = room.state;
    const ps = getPS(gs, socket.id);
    if (!ps || gs.awaitMedicSide !== ps.myKey) return;
    const i = ps.me.gy.findIndex(c => c.uid === cardUid);
    if (i === -1) return;
    const card = ps.me.gy.splice(i, 1)[0];
    const row = card.subtype === 'agile' ? 'close' : (card.row || 'close');
    ps.me.board[row].push(card);
    addLog(gs, `💊 Medic revived ${card.name}!`, true);
    gs.awaitMedicSide = null;
    advanceTurn(gs);
    if (gs.phase === 'resolving') {
      broadcastState(room);
      broadcastRoundResult(room);
    } else {
      broadcastState(room);
    }
  });

  socket.on('medic_skip', () => {
    const room = rooms[socket.data.room];
    if (!room?.state) return;
    const gs = room.state;
    const ps = getPS(gs, socket.id);
    if (!ps || gs.awaitMedicSide !== ps.myKey) return;
    gs.awaitMedicSide = null;
    advanceTurn(gs);
    broadcastState(room);
  });

  socket.on('redraw_cards', ({ uids }) => {
    const room = rooms[socket.data.room];
    if (!room?.state) return;
    const gs = room.state;
    const ps = getPS(gs, socket.id);
    if (!ps || ps.me.redrawsLeft <= 0) return;
    if (!Array.isArray(uids) || uids.length === 0 || uids.length > 3) return;
    const removed = [];
    // Remove in reverse so indices stay valid
    const indices = uids.map(uid => ps.me.hand.findIndex(c => c.uid === uid)).filter(i => i !== -1);
    indices.sort((a, b) => b - a).forEach(i => removed.push(...ps.me.hand.splice(i, 1)));
    removed.forEach(c => ps.me.deck.unshift(c));
    ps.me.deck = shuffle(ps.me.deck);
    drawCards(ps.me, removed.length);
    ps.me.redrawsLeft--;
    addLog(gs, `🔄 ${removed.length} card(s) redrawn.`, false);
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    console.log('- disconnect', socket.id);
    const code = socket.data.room;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    room.sockets.forEach(sid => {
      if (sid !== socket.id) io.to(sid).emit('opponent_left');
    });
    setTimeout(() => { if (rooms[code]) { delete rooms[code]; delete nextRoundReady[code]; } }, 30000);
  });
});

// ── Periodic stale-room cleanup ────────────────────────────────
setInterval(() => {
  Object.keys(rooms).forEach(code => {
    const r = rooms[code];
    const alive = (r.sockets || []).some(sid => io.sockets.sockets.get(sid));
    if (!alive) { delete rooms[code]; delete nextRoundReady[code]; console.log('[cleaned]', code); }
  });
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Gwent PvP on 0.0.0.0:${PORT}`));
