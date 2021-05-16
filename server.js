const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {userJoin, getCurrentUser, userLeave} = require('./utils/users');
const { Console } = require('console');
const mysql = require("mysql2");

const app = express();
const server = http.createServer(app);
const io = socketio(server);
  
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  database: "chat",
  password: "root"
});

// тестирование подключения
connection.connect(function(err){
    if (err) {
      return console.error("Ошибка: " + err.message);
    }
    else{
      console.log("Подключение к серверу MySQL успешно установлено");
    }
 });

 function checkBd(username, password){
    return new Promise(function(resolve,reject) {
        // дастаем данные из таблицы
        connection.execute("SELECT * FROM users",
            function(err, results) {
            let users = results; 
            for (let i = 0; i < users.length; i++){
                if (username == users[i].login && password == users[i].password) {
                    resolve();
                    return;
                }
            }
            reject();
        });
    });
 }




require('socketio-auth')(io, {
    authenticate: async function (socket, data, callback) {
        // Пароль и логин, которые пришли.
        var username = data.username;
        var password = data.password;
        await checkBd(username, password)
            .then(()=>callback(null,true))
            .catch(()=>callback(new Error("User not found or password not true")));
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