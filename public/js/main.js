(function () {
    const chatForm = document.getElementById('chat-form');
    const ChatMessages = document.querySelector('.chat-messages');
    const store = new SignalProtocolStore();
    const keyHelper = libsignal.KeyHelper;
    const sessionCipher ={}
    const deviceId = 0;
    const socket = io();
    var username = getCookie("username");
    var password = getCookie("password");
    var room = getCookie("room");
    const userList = new Set();
    const $usersList = document.querySelector('#users');
    const roomName = document.querySelector('#room-name');
    const serverKeys = [];

    /**
     * Получение куки по ключу.
     * @param {*} name Ключ.
     * @returns Значение.
     */
    function getCookie(name) {
        var matches = document.cookie.match(new RegExp(
            "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
        ))
        return matches ? decodeURIComponent(matches[1]) : undefined
    }

    /**
     * Обновить список пользователей на странице.
     */
    const renderUserList = () => {
        $usersList.innerHTML = '';
        userList.forEach(user => {
            const $li = document.createElement('li');
            $li.innerHTML = user;
            $usersList.append($li);
        })
    }

    /**
     * Добавить пользователя.
     * @param {*} username Логин.
     */
    const addUser = username => {
        userList.add(username);
        renderUserList();
    }

    /**
     * Удалить пользователя.
     * @param {*} username Логин.
     */
    const removeUser = username => {
        userList.delete(username);
        renderUserList();
    }

    /**
     * Добавить название диалога.
     * @param {*} room 
     */
    function outputRoomName(room) {
        roomName.innerText = room;
    }

    /**
     * Сгенерировать KeyId.
     * @param {*} socketId 
     * @returns KeyId.
     */
    const generateKeyId = socketId => {
        let keyId = '';
        const date = String(Date.now()).slice(-3);

        for (let i = 0; i < 2; i++) {
            keyId += socketId.charCodeAt(Math.floor(Math.random() * socketId.length));
        }

        return Number(keyId + date)
    }

    /**
     * Сгенерировать регистрационный id и пару идентификационных ключей.
     */
    const generateIdentity = async () => {
        const registrationId = keyHelper.generateRegistrationId();
        store.put('registrationId', registrationId);
        const identityKeyPair = await keyHelper.generateIdentityKeyPair();
        store.put('identityKey', identityKeyPair);
    }

    /**
     * Сгенерировать PreKeys.
     * @param {*} socketId 
     * @returns 
     */
    const generatePreKeys = async  socketId => {
        const keyId = generateKeyId(socketId);
        const identityKeyPair = await store.getIdentityKeyPair();
        const signedPreKey = await keyHelper.generateSignedPreKey(identityKeyPair, keyId);
        store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);
        const preKey = await keyHelper.generatePreKey(keyId);
        store.storePreKey(preKey.keyId, preKey.keyPair);

        return {
            registrationId: await store.getLocalRegistrationId(),
            identityKey: identityKeyPair.pubKey,
            signedPreKey: {
                keyId: signedPreKey.keyId,
                publicKey: signedPreKey.keyPair.pubKey,
                signature: signedPreKey.signature
            },
            preKey: {
                keyId: preKey.keyId,
                publicKey: preKey.keyPair.pubKey
            }
        }
    }

    /**
     * Сгенерировать сессию.
     * @param {*} username Логин.
     * @param {*} keyBundle Пакет ключей.
     * @returns Сессия.
     */
    const buildSession = async (username, keyBundle) => {
        const address = new libsignal.SignalProtocolAddress(username, deviceId);
        const sessionBuilder = new libsignal.SessionBuilder(store, address);
        await sessionBuilder.processPreKey(keyBundle);
        return new libsignal.SessionCipher(store, address);
    }
    
    /**
     * Импортирование ключа.
     * @param {*} pubKey 
     * @returns 
     */
    const importPublicKey = async(pubKey) =>
        window.crypto.subtle.importKey(
            "jwk", 
            pubKey,
            {   
                name: "AES-CBC"
            },
            false, 
            ["encrypt"] 
        )
      
    /**
     * Получить ключ первого сервера.
     */        
    async function getFirstPubKeys() {
        const getFirstKey = await fetch("http://192.168.0.111:3002/getPubKey", { 
                method: "GET", 
                headers: { "Accept": "application/json" }
            });

        if (getFirstKey.ok === true) {
            var serverData = await getFirstKey.json();
            var firstPubKey = await importPublicKey(serverData.publicKey);
            serverKeys.push({
                id: serverData.id,
                firstPubKey: firstPubKey
            });
        }       
    }

    /**
     * Получить ключ второго сервера.
     */
    async function getSecondPubKeys() {
        const getSecondKey = await fetch("http://localhost:3003/getPubKey", { 
                method: "GET", 
                headers: { "Accept": "application/json" }
            });

        if (getSecondKey.ok === true) {
            var serverData = await getSecondKey.json();
            var secondPubKey = await importPublicKey(serverData.publicKey);
            serverKeys.push({
                id: serverData.id,
                secondPubKey: secondPubKey
            });
        }       
    }

    /**
     * Получить ключ третьего сервера.
     */
    async function getThirdPubKeys() {
        const getSecondKey = await fetch("http://localhost:3001/getPubKey", { 
                method: "GET", 
                headers: { "Accept": "application/json" }
            });

        if (getSecondKey.ok === true) {
            var serverData = await getSecondKey.json();
            var thirdPubKey = await importPublicKey(serverData.publicKey);
            serverKeys.push({
                id: serverData.id,
                thirdPubKey: thirdPubKey
            });
        }       
    }

    /**
     * Преобразование данных в массив.
     * @param {*} data 
     * @returns 
     */
    const encode = data => {
        const encoder = new TextEncoder()  
        return encoder.encode(data)
    }

    /**
     * Шифрование AES.
     * @param {*} data Данные для шифрования.
     * @param {*} key Ключ.
     * @param {*} iv Инициализирующий вектор.
     * @returns 
     */
    const encrypt = async (data, key, iv) => {
        const encoded = encode(data);
        const ciphertext = await window.crypto.subtle.encrypt(
            {
                name: "AES-CBC",
                iv: iv
            },
            key,
            encoded
        );
        
        return ciphertext;
    }
    
    /**
     * Запаковать данные.
     * @param {*} buffer 
     * @returns 
     */
    const pack = buffer => window.btoa(
        String.fromCharCode.apply(null, new Uint8Array(buffer))
    )

    /**
     * Вывод сообщений бота.
     * @param {*} message Текст.
     */
    function outputBotMessage(message) {
        const div = document.createElement('div');
        div.classList.add('message');
        div.innerHTML = `<p class = "meta">${message.username} <span>${message.time}</span></p>
        <p class="text">${message.text}</p>`;
        document.querySelector('.chat-messages').appendChild(div);
    }

    /**
     * Вывод сообщения.
     * @param {*} username Логин.
     * @param {*} message Сообщение.
     */
    function outputMessage(username, message) {
        const div = document.createElement('div');
        div.classList.add('message');
        var date = new Date();
        var hours = date.getHours();
        var min = date.getMinutes();
        var format = 'AM';

        if (hours > 12){
            format = 'PM';
            hours = hours - 12;
        }

        div.innerHTML = `<p class = "meta">${username} <span>${hours}:${min} ${format}</span></p>
        <p class="text">${message}</p>`;
        document.querySelector('.chat-messages').appendChild(div);
    }

    

    /**
     * Отправить сообщение на сервер.
     * @param {*} to Отправитель.
     * @param {*} encrypted Зашифрованное сообщение.
     */
    async function sendMessageOnFirstServer(to, encrypted) {
        var iv = window.crypto.getRandomValues(new Uint8Array(16));
        to = await encrypt(to, serverKeys[2].thirdPubKey, iv);
        to = pack(to);
        to = await encrypt(to, serverKeys[1].secondPubKey, iv);
        to = pack(to);
        to = await encrypt(to, serverKeys[0].firstPubKey, iv);
        
        var from = await encrypt(username, serverKeys[2].thirdPubKey, iv);
        from = pack(from);
        from = await encrypt(from, serverKeys[1].secondPubKey, iv);
        from = pack(from);
        from = await encrypt(from, serverKeys[0].firstPubKey, iv);

        const response = await fetch("http://localhost:3002/message", { 
            mode: 'no-cors',
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                to: pack(to),
                from: pack(from),
                message: encrypted,
                firstId: serverKeys[0].id,
                secondId: serverKeys[1].id,
                thirdId: serverKeys[2].id,
                iv: pack(iv)
            })
        });
    }
    
    /**
     * Запрос на аутенцификацию.
     */
    socket.emit('authentication', { username, password });

    /**
     * При успешной аутентификации.
     */
    socket.on('authenticated', function () {
        socket.emit('join', { username, password, room });
    });

    /**
     * При неуспешной аутентификации.
     */
    socket.on('unauthorized', function (err) {
        console.log("There was an error with the authentication:", err.message);
        document.location.replace("index.html");
    });

    /**
     * Присоединиться к чату.
     */
    socket.on('joined', async ()=> {
        await generateIdentity();
        const keyBundle = await generatePreKeys(socket.id);
        await getFirstPubKeys();
        await getSecondPubKeys();
        await getThirdPubKeys();
        socket.emit('newSession', keyBundle);
        outputRoomName(room);
    })

    /**
     * Запрос сессии.
     */
    socket.on('newSession', async data => {
        addUser(data.from);
        const keyBundle = await generatePreKeys(socket.id);
        sessionCipher[data.from] = await buildSession(data.from, data.body);

        socket.emit('newSessionReplay', {
            to: data.from,
            body: keyBundle
        })
    })

    /**
     * Запуск сессии.
     */
    socket.on('newSessionReplay', async data => {
        addUser(data.from);
        sessionCipher[data.from] = await buildSession(data.from, data.body);      
    })

    /**
     * Отключение от чата.
     */
    socket.on('userDisc', async username => {
        removeUser(username);
        await store.removeSession(username + '.' + deviceId);
        delete sessionCipher[username];
    })

    /**
     * Получение сообщений от бота.
     */
    socket.on('message', message =>{
        outputBotMessage(message);
        ChatMessages.scrollTop = ChatMessages.scrollHeight;
    })

    /**
     * Отправить сообщение.
     * @param {*} event 
     */
    const sendMessage = async event => {
        event.preventDefault();
        const msg = event.target.elements.msg.value;
        outputMessage('me', msg);

        for (let id in sessionCipher) {
            const encrypted = await sessionCipher[id].encrypt(msg);
            sendMessageOnFirstServer(id, encrypted);
        }

        event.target.elements.msg.value = '';
        event.target.elements.msg.focus();
    }

    /**
     * Получение сообщения.
     */
    socket.on('msg', async data => {
        let decrypted;

        if (data.body.type === 3) {
            decrypted = await sessionCipher[data.from].decryptPreKeyWhisperMessage(data.body.body, 'binary')
        } else {
            decrypted = await sessionCipher[data.from].decryptWhisperMessage(data.body.body, 'binary')
        }

        outputMessage(data.from, String.fromCharCode.apply(null, new Uint8Array(decrypted)));
        ChatMessages.scrollTop = ChatMessages.scrollHeight;
    })

    /**
     * Обработчик нажатия кнопки типа submit.
     */
    chatForm.addEventListener('submit', sendMessage);

})()