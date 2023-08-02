import express from "express";
const app = express();
import http from "http";
const server = http.createServer(app);
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chalk from "chalk";
const io = new Server(server);
import { post, checkAllListings } from "./index.js";
const port = 80;
let cancel = false;

io.eio.pingTimeout = 300000; // 5 minutes

app.get("/", (req, res) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  // Determine and log who has connected
  var clientIp = socket.request.connection.remoteAddress;

  let ip = clientIp.split(".").pop();
  let user = undefined;
  switch (ip) {
    case "99":
      user = "Max";
      break;
  }

  let who = user ? user : clientIp;
  console.log("New user connection: " + chalk.yellow(who));

  // when the post button is clicked
  socket.on("post", (config) => {
    socket.emit("update", "Posting...");
    post(config, socket);
  });

  // when the check button is clicked
  socket.on("check", () => {
    socket.emit("update", "Checking all listings...");
    checkAllListings(socket);
  });
});

server.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default cancel;
