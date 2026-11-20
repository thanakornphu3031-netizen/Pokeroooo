const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function deck() {
  const cards = [];
  for (const suit of SUITS) for (let i=0;i<RANKS.length;i++) cards.push({rank:RANKS[i], value:i+2, suit});
  for (let i=cards.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [cards[i],cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}
function handScore(cards) {
  const vals=cards.map(c=>c.value).sort((a,b)=>b-a);
  const counts={};
  vals.forEach(v=>counts[v]=(counts[v]||0)+1);
  const groups=Object.entries(counts).map(([v,n])=>({v:+v,n})).sort((a,b)=>b.n-a.n||b.v-a.v);
  const flush=cards.every(c=>c.suit===cards[0].suit);
  const unique=[...new Set(vals)].sort((a,b)=>b-a);
  let straight=0;
  if(unique.length===5) {
    if(unique[0]-unique[4]===4) straight=unique[0];
    else if(unique.join(",")==="14,5,4,3,2") straight=5;
  }
  if(flush&&straight) return [8,straight];
  if(groups[0].n===4) return [7,groups[0].v,groups[1].v];
  if(groups[0].n===3&&groups[1].n===2) return [6,groups[0].v,groups[1].v];
  if(flush) return [5,...vals];
  if(straight) return [4,straight];
  if(groups[0].n===3) return [3,groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)];
  if(groups[0].n===2&&groups[1].n===2) return [2,Math.max(groups[0].v,groups[1].v),Math.min(groups[0].v,groups[1].v),groups[2].v];
  if(groups[0].n===2) return [1,groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)];
  return [0,...vals];
}
function handName(s) {
  return ["ไพ่สูง","หนึ่งคู่","สองคู่","ตอง","เรียง","Flush","Full House","Four of a Kind","Straight Flush"][s[0]];
}
function compare(a,b) {
  const x=handScore(a), y=handScore(b);
  for(let i=0;i<Math.max(x.length,y.length);i++) {
    if((x[i]||0)>(y[i]||0)) return 1;
    if((x[i]||0)<(y[i]||0)) return -1;
  }
  return 0;
}
function publicRoom(room) {
  return {code:room.code, players:room.players.map(p=>({id:p.id,name:p.name,ready:p.ready})), started:room.started};
}
function sendRoom(room) { io.to(room.code).emit("room:update",publicRoom(room)); }
function startRound(room) {
  if(room.players.length!==2) return;
  const d=deck();
  room.hands={};
  room.players.forEach(p=>room.hands[p.id]=d.splice(0,5));
  room.started=true;
  room.roundId=(room.roundId||0)+1;
  room.players.forEach(p=>io.to(p.id).emit("game:hand",{cards:room.hands[p.id],round:room.roundId}));
  io.to(room.code).emit("game:started",{round:room.roundId});
}
io.on("connection", socket=>{
  socket.on("room:create", ({name})=>{
    const code=Math.random().toString(36).slice(2,7).toUpperCase();
    const room={code,players:[{id:socket.id,name:String(name||"ผู้เล่น").slice(0,18),ready:false}],started:false,hands:{}};
    rooms.set(code,room); socket.join(code); socket.data.room=code;
    socket.emit("room:joined",{code,playerId:socket.id}); sendRoom(room);
  });
  socket.on("room:join", ({code,name})=>{
    code=String(code||"").trim().toUpperCase();
    const room=rooms.get(code);
    if(!room) return socket.emit("error:message","ไม่พบห้องนี้");
    if(room.players.length>=2) return socket.emit("error:message","ห้องเต็มแล้ว (2 คน)");
    room.players.push({id:socket.id,name:String(name||"ผู้เล่น").slice(0,18),ready:false});
    socket.join(code); socket.data.room=code;
    socket.emit("room:joined",{code,playerId:socket.id}); sendRoom(room);
  });
  socket.on("game:ready",()=>{
    const room=rooms.get(socket.data.room); if(!room||room.players.length!==2) return;
    const p=room.players.find(x=>x.id===socket.id); if(p) p.ready=true;
    sendRoom(room);
    if(room.players.every(x=>x.ready)) startRound(room);
  });
  socket.on("game:again",()=>{
    const room=rooms.get(socket.data.room); if(!room||room.players.length!==2) return;
    const p=room.players.find(x=>x.id===socket.id); if(p) p.ready=true;
    if(room.players.every(x=>x.ready)) startRound(room);
    else socket.emit("game:waiting","รอผู้เล่นอีกคนกดเล่นรอบใหม่");
  });
  socket.on("game:reveal",()=>{
    const room=rooms.get(socket.data.room); if(!room||!room.started) return;
    const result=compare(room.hands[room.players[0].id],room.hands[room.players[1].id]);
    const winner=result===0?null:(result>0?room.players[0]:room.players[1]);
    io.to(room.code).emit("game:result",{
      players:room.players.map(p=>({id:p.id,name:p.name,cards:room.hands[p.id],hand:handName(handScore(room.hands[p.id]))})),
      winner:winner?winner.name:null,draw:!winner
    });
    room.started=false; room.players.forEach(p=>p.ready=false);
  });
  socket.on("disconnect",()=>{
    const code=socket.data.room, room=rooms.get(code); if(!room) return;
    room.players=room.players.filter(p=>p.id!==socket.id);
    if(!room.players.length) rooms.delete(code);
    else {room.started=false; room.players.forEach(p=>p.ready=false); sendRoom(room); io.to(code).emit("error:message","ผู้เล่นอีกคนออกจากห้องแล้ว");}
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Card Duel running at http://localhost:${PORT}`));
