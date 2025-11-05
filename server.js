const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { pool, init } = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

init(); // Initialize DB tables

let games = {}; // gameId -> { board, players, turn }

function createEmptyBoard() {
  // 6x6 grid, 6 units per player
  let board = Array(6).fill(null).map(() => Array(6).fill(null));
  for (let i = 0; i < 6; i++) {
    board[0][i] = "P1";
    board[5][i] = "P2";
  }
  return board;
}

// Matchmaking
io.on("connection", async (socket) => {
  console.log("User connected:", socket.id);

  // Load or create player
  let res = await pool.query("SELECT * FROM players WHERE id=$1", [socket.id]);
  if (res.rows.length === 0) {
    await pool.query("INSERT INTO players (id, score, color) VALUES ($1,$2,$3)", [socket.id,0,"blue"]);
  }
  
  // Add to queue
  await pool.query("INSERT INTO queue (id) VALUES ($1) ON CONFLICT DO NOTHING", [socket.id]);

  // Check for a match
  let queueRes = await pool.query("SELECT * FROM queue LIMIT 2");
  if (queueRes.rows.length === 2) {
    let [p1, p2] = queueRes.rows;
    const gameId = p1.id + "-" + p2.id;
    games[gameId] = {
      board: createEmptyBoard(),
      players: [p1.id, p2.id],
      turn: 0,
      moves: 0
    };
    // Remove from queue
    await pool.query("DELETE FROM queue WHERE id=$1 OR id=$2", [p1.id,p2.id]);
    
    // Notify players
    io.to(p1.id).emit("gameStart", { gameId, color:"blue", board:games[gameId].board });
    io.to(p2.id).emit("gameStart", { gameId, color:"red", board:games[gameId].board });
  }

  // Handle moves
  socket.on("move", async ({ gameId, from, to }) => {
    const game = games[gameId];
    if (!game) return;
    const playerIndex = game.players.indexOf(socket.id);
    if (playerIndex !== game.turn % 2) return; // Not your turn
    const piece = game.board[from[0]][from[1]];
    game.board[from[0]][from[1]] = null;
    game.board[to[0]][to[1]] = piece;

    game.turn++;
    game.moves++;

    // Broadcast update
    game.players.forEach(p => io.to(p).emit("updateBoard", game.board));

    // Check for end
    const p1Count = game.board.flat().filter(c => c==="P1").length;
    const p2Count = game.board.flat().filter(c => c==="P2").length;
    if (p1Count === 0 || p2Count === 0 || game.moves >= 20) {
      let winner = p1Count > p2Count ? game.players[0] : p2Count > p1Count ? game.players[1] : null;
      for (let p of game.players) {
        let points = (winner === p) ? 100 : Math.max(p1Count,p2Count)*10;
        await pool.query("UPDATE players SET score=score+$1 WHERE id=$2", [points, p]);
      }
      game.players.forEach(p => io.to(p).emit("gameEnd", { winner }));
      delete games[gameId];
    }
  });

  // Handle color change
  socket.on("setColor", async (color) => {
    await pool.query("UPDATE players SET color=$1 WHERE id=$2", [color,socket.id]);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});
  
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
