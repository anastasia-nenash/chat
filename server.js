const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {userJoin, getCurrentUser, userLeave, findByUsername} = require('./utils/users');
const { Console } = require('console');
const mysql = require("mysql2");
const { json } = require('express');
const sha1 = require('sha1');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  database: "chat",
  password: "root"
});

// тестирование подключения к бд
connection.connect(function(err){
    if (err) {
      return console.error("Ошибка: " + err.message);
    }
    else{
      console.log("Подключение к серверу MySQL успешно установлено");
    }
 });

 // функция для проверки логина и пароля при авторизации
 function checkBd(username, password){
    return new Promise(function(resolve,reject) {
        // дастаем данные из таблицы
        connection.execute("SELECT * FROM users",
            function(err, results) {
            let users = results; 
            for (let i = 0; i < users.length; i++){
                if (username == users[i].login && sha1(password) == users[i].password) {
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
app.use(express.json());

app.post('/addUser', function(req, res) {
    const user = [req.body.username, sha1(req.body.password)];
    connection.query('INSERT INTO users(login, password) VALUES (?,?)', user, function (err, results) {
        if (err) console.log(err);
        else console.log("Данные добавлены");
    }
    )
});

io.on("connection", (socket) => {
    let user_for_left;

    //подключение пользователя к чату
    socket.on("join", ({ username, password }) => {
        user_for_left = username;
        const user = userJoin(socket.id, username, password);
        socket.join();
        socket.emit('joined');
        socket.emit("message", formatMessage(botName, "Welcome to chat"));
        socket.broadcast.emit(
            "message",
            formatMessage(botName, `${user.username} has joined the chat`)
        );
    });

    socket.on('newSession', data => {
        const user = getCurrentUser(socket.id)
        socket.broadcast.emit('newSession', {
            from: user.username,
            body: data
        })
    })   

    socket.on('newSessionReplay', data => {
        socket.to(findByUsername(data.to).id).emit('newSessionReplay', {
            from: getCurrentUser(socket.id).username,
            body: data.body,
        })
    })    
    
    socket.on('msg', data => {
        socket.to(findByUsername(data.to).id).emit('msg', {
            from: getCurrentUser(socket.id).username,
            body: data.body,
        })
    })    

    //отправка сообщения
    // socket.on("ChatMessage", (msg) => {
    //     const user = getCurrentUser(socket.id);
    //     io.to().emit("mes", formatMessage(user.username, msg));
    // });

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