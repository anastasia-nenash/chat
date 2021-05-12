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

require('socketio-auth')(io, {
    authenticate: function (socket, data, callback) {
        // Пароль и логин, которые пришли.
        var username = data.username;
        var password = data.password;

        if (username === "123") {
            // Если пользователь существует, то проверяем пароль.
            return callback(null, "123" == password);
        }
        else {
            // Пользователя не существует.
            return callback(new Error("User not found"));
        }
    }
});

const botName = 'chat bot';

app.use(express.static(path.join(__dirname, 'public')));

io.on("connection", (socket) => {
    let user_for_left;

    //подключение пользователя к чату
    socket.on("join", ({ username, password }) => {
        user_for_left = username;
        const user = userJoin(socket.id, username, password);
        socket.join();
        socket.emit("message", formatMessage(botName, "Welcome to chat"));
        socket.broadcast.emit(
            "message",
            formatMessage(botName, `${user.username} has joined the chat`)
        );
    });

    //отправка сообщения
    socket.on("ChatMessage", (msg) => {
        const user = getCurrentUser(socket.id);
        io.to().emit("message", formatMessage(user.username, msg));
    });

    //отключение пользователя от чата
    socket.on("disconnect", () => {
        const user = userLeave(socket.id);
        if (user) {
            socket.broadcast.emit(
                "message",
                formatMessage(botName, `${user_for_left} has left the chat`)
            );
        }
    });
});



const PORT = 3001 || process.env.PORT;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));