const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {userJoin, getCurrentUser, userLeave, findByUsername, getRoomUsers} = require('./utils/users');
const { Console } = require('console');
const mysql = require("mysql2");
const { json } = require('express');
const sha1 = require('sha1');
const botName = 'chat bot';
const app = express();
const server = http.createServer(app);
const io = socketio(server);
const FastMQ = require('fastmq');
const { subtle } = require('node:crypto').webcrypto;
const argon2 = require('argon2');
const keys = [];
var id = 1;
const messages = [];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

/**
 * Создание подключения к MySql.
 */
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  database: "chat",
  password: "root"
});

/**
 * Проверка подключения к бд.
 */
connection.connect(function(err){
    if (err) {
      return console.error("Ошибка: " + err.message);
    }
    else{
      console.log("Подключение к серверу MySQL успешно установлено");
    }
});

/**
 * Функция для проверки логина и пароля при авторизации.
 * @param {*} username Логин.
 * @param {*} password Пароль.
 * @returns 
 */
function checkBd(username, password){
    return new Promise(function(resolve,reject) {
        connection.execute("SELECT * FROM users",
             async function(err, results) {
                let users = results; 
                for (let i = 0; i < users.length; i++){
                    const verify = await argon2.verify(users[i].password, password);
                    if (username == users[i].login && verify) {
                        resolve();
                        return;
                    }
                }
                reject();
        });
    });
}

/**
 * Авторизация Socket-IO.
 */
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

/**
 * Добавление пользователей при регистрации.
 */
app.post('/addUser', async function (req, res) {
    const password = await argon2.hash(req.body.password);
    const user = [req.body.username, password];
    connection.query('INSERT INTO users(login, password) VALUES (?,?)', user, function (err, results) {
        if (err) console.log(err);
        else console.log("Данные добавлены");
    }
    )
});

const generateKey = async () =>
        subtle.generateKey({
            name: "AES-CBC",
            length: 256,
        }, true, ['encrypt', 'decrypt']);

const exportPublicKey = async(key) =>
    subtle.exportKey(
        "jwk", 
        key
    );

app.get("/getPubKey", async function (req, res) {  
    var key = await generateKey();
    var publicKey = await exportPublicKey(key);
    keys.push({
        key: key,
        id: id
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'origin, content-type, accept');
    res.send(JSON.stringify({publicKey, id}));
    id += 1;
});

const unpack = packed => {
    const string = atob(packed)
    const buffer = new ArrayBuffer(string.length)
    const bufferView = new Uint8Array(buffer)

    for (let i = 0; i < string.length; i++) {
        bufferView[i] = string.charCodeAt(i)
    }

    return buffer
}

const decode = byteStream => {
    const decoder = new TextDecoder()

    return decoder.decode(byteStream)
}

const decrypt = async (ciphertext, key, iv) => {
    let decrypted = await subtle.decrypt(
        {
            name: "AES-CBC",
            iv: iv
        },
        key,
        ciphertext
      );

    return decode(decrypted);
}

/**
 * Запуск Socket-IO.
 */
io.on("connection", (socket) => {
    let user_for_left;

    /**
     * Подключение пользователя к чату.
     */
    socket.on("join", ({ username, password, room }) => {
        user_for_left = username;
        const user = userJoin(socket.id, username, password, room);
        socket.join(user.room);
        socket.emit('joined');
        socket.emit("message", formatMessage(botName, "Welcome to chat"));
        socket.broadcast.to(user.room).emit(
            "message",
            formatMessage(botName, `${user.username} has joined the chat`)
        );
    });

    /**
     * Запрос клиента на создание новой сессии Signal.
     */
    socket.on('newSession', data => {
        const user = getCurrentUser(socket.id)
        socket.broadcast.to(user.room).emit('newSession', {
            from: user.username,
            body: data
        })
    })   

    /**
     * Создание новой сессии Signal.
     */
    socket.on('newSessionReplay', data => {
        socket.to(findByUsername(data.to).room).emit('newSessionReplay', {
            from: getCurrentUser(socket.id).username,
            body: data.body,
        })
    })    

    /**
     * Отключение пользователя от чата.
     */
    socket.on("disconnect", () => {
        const user = userLeave(socket.id);
        if (user) {
            socket.broadcast.to(user.room).emit(
                "message",
                formatMessage(botName, `${user_for_left} has left the chat`)
            );
        }
    });
});

var responseFromThirdServer;

/**
 * Отправка сообщения клиенту.
 */
FastMQ.Client.connect('firstServerChannel', 7500, 'localhost')
    .then((channel) => {
        channel.response('getMessageFromThirdServer', async (msq, res) => {
            responseFromThirdServer = msq.payload.data;
            messages.push(responseFromThirdServer);
            var privateKey;
            var m = [];  
            if (messages.length == 3) {
                for (let i = 0; i < messages.length; i++) {
                    keys.forEach(element => {
                        if (element.id == messages[i].thirdId){
                            privateKey = element.key;
                        }               
                    });

                    messages[i].to = await decrypt(unpack(messages[i].to), 
                        privateKey, unpack(messages[i].iv));
                    messages[i].from = await decrypt(unpack(messages[i].from), 
                        privateKey, unpack(messages[i].iv));
                    m.push(messages[i]);
                    const recepient = findByUsername(messages[i].to).id;
                    io.to(recepient).emit('msg', {
                        from: messages[i].from,
                        body: messages[i].message,
                    });
                }
                console.log(m);
                messages.splice(0, 3);
            }
            
        })
    })
    .catch((err) => {
        console.log('Got error:', err.stack);
    });

const PORT = process.env.PORT || 3001;
const IP =  process.env.IP || 'localhost';
server.listen(PORT, IP);