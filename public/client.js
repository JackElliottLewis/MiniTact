const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = 600;
canvas.height = 600;

const socket = io();

let gameId = null;
let board = [];
let myColor = "blue";

function drawBoard() {
  ctx.clearRect(0,0,600,600);
  for(let i=0;i<6;i++){
    for(let j=0;j<6;j++){
      ctx.strokeStyle="white";
      ctx.strokeRect(j*100,i*100,100,100);
      let piece = board[i][j];
      if(piece){
        ctx.fillStyle = (piece==="P1") ? "blue" : "red";
        ctx.fillRect(j*100+20,i*100+20,60,60);
      }
    }
  }
}

canvas.addEventListener("click", (e)=>{
  // Simple move logic: select first piece then destination
  const x = Math.floor(e.offsetX/100);
  const y = Math.floor(e.offsetY/100);
  if(selected){
    socket.emit("move",{gameId, from:selected, to:[y,x]});
    selected = null;
  } else if(board[y][x]){
    selected = [y,x];
  }
});

let selected = null;

// Game start
socket.on("gameStart",(data)=>{
  gameId = data.gameId;
  board = data.board;
  myColor = data.color;
  drawBoard();
  alert("Game started! Your color: "+myColor+"\nInstructions: Click your piece then destination square. Turn-based.");
});

// Update board
socket.on("updateBoard",(b)=>{
  board = b;
  drawBoard();
});

// Game end
socket.on("gameEnd",(data)=>{
  alert("Game ended! Winner: "+data.winner);
});
