const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {userJoin, getCurrentUser, userLeave} = require('./utils/users');
const { Console } = require('console');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const botName = 'chat bot';

app.use(express.static(path.join(__dirname, 'public')));

// server.use("/login", () => {
//     //generate token ==> cookie 
// });

io.on('connection', socket => {
    
    let user_for_left;

    socket.on('join', ({username, password}) =>{
        user_for_left = username;
        const user = userJoin(socket.id, username, password);
        socket.join();
        socket.emit('message', formatMessage(botName,'Welcome to chat'));
        socket.broadcast.emit('message', formatMessage(botName, `${user.username} has joined the chat`));
        
    })

    socket.on("ChatMessage", (msg) => {
      const user = getCurrentUser(socket.id);
      io.to().emit("message", formatMessage(user.username, msg));
    });
    socket.on("disconnect", () => {
        const user = userLeave(socket.id);
        if (user){
            socket.broadcast.emit("message", formatMessage(botName, `${user_for_left} has left the chat`));
        }
        
        
    });

    
})

const PORT = 3001 || process.env.PORT;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));