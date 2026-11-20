
const socket = io();

const $ = id => document.getElementById(id);

let myId = null;
let roomCode = null;

function toast(message) {
  alert(message);
}

function playerName() {
  return $("playerName").value.trim() || "Player";
}

function showTable() {
  $("lobby").classList.add("hidden");
  $("table").classList.remove("hidden");
}

$("createBtn").onclick = () => {
  socket.emit("room:create", {
    name: playerName()
  });
};

$("joinBtn").onclick = () => {
  socket.emit("room:join", {
    name: playerName(),
    code: $("roomCode").value
  });
};

socket.on("room:joined", data => {
  roomCode = data.code;
  myId = data.playerId;

  $("codeLabel").textContent = roomCode;
  showTable();
  toast("เข้าห้องสำเร็จ!");
});

socket.on("room:update", room => {
  $("players").innerHTML = room.players.map((p, i) => `
    <div class="player">
      ผู้เล่น ${i + 1}: ${escapeHTML(p.name)}
      ${p.id === myId ? "(คุณ)" : ""}
      <br>
      ${p.ready ? "พร้อมแล้ว" : "รอพร้อม"}
    </div>
  `).join("");

  $("readyBtn").disabled = room.players.length !== 2;
});

$("readyBtn").onclick = () => {
  socket.emit("game:ready");
  $("readyBtn").disabled = true;
  $("status").textContent = "รอผู้เล่นอีกคน...";
};

socket.on("game:hand", data => {
  renderCards("myCards", data.cards);

  $("opponentCards").innerHTML = "";
  $("status").textContent = "ได้รับไพ่แล้ว!";
  $("readyBtn").classList.add("hidden");
  $("revealBtn").classList.remove("hidden");
});

$("revealBtn").onclick = () => {
  socket.emit("game:reveal");
};

socket.on("game:result", data => {
  const mine = data.players.find(p => p.id === myId);
  const other = data.players.find(p => p.id !== myId);

  if (mine) renderCards("myCards", mine.cards);
  if (other) renderCards("opponentCards", other.cards);

  $("result").innerHTML = `
    <h2>${data.draw ? "เสมอกัน!" : "ผู้ชนะ: " + escapeHTML(data.winner)}</h2>
    <p>ไพ่ของคุณ: ${mine ? mine.hand : "-"}</p>
    <p>ไพ่คู่แข่ง: ${other ? other.hand : "-"}</p>
  `;

  $("status").textContent = "จบรอบแล้ว";
  $("revealBtn").classList.add("hidden");
  $("againBtn").classList.remove("hidden");
});

$("againBtn").onclick = () => {
  socket.emit("game:again");
  $("againBtn").disabled = true;
  $("status").textContent = "รอผู้เล่นอีกคน...";
};

$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    toast("คัดลอกรหัสห้องแล้ว");
  } catch {
    toast("รหัสห้อง: " + roomCode);
  }
};

$("leaveBtn").onclick = () => {
  location.reload();
};

socket.on("game:waiting", msg => toast(msg));
socket.on("error:message", msg => toast(msg));

function renderCards(id, cards) {
  $(id).innerHTML = cards.map(card => `
    <div class="card ${
      ["♥", "♦"].includes(card.suit) ? "red" : ""
    }">
      <span>${card.rank}</span>
      <span>${card.suit}</span>
    </div>
  `).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
