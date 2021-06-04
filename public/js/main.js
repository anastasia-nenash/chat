(function () {
    const chatForm = document.getElementById('chat-form');
    const ChatMessages = document.querySelector('.chat-messages');
    var username = getCookie("username");
    var password = getCookie("password");

    // init store
    const store = new SignalProtocolStore()
    // init keyhelper
    const keyHelper = libsignal.KeyHelper
    // object that holds individual cyphers
    const sessionCipher ={}
    // no need for multi device support, so hardcoding 0
    const deviceId = 0

    const socket = io();

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

    const userList = new Set()
    const $usersList = document.querySelector('#users')

    const renderUserList = () => {
        $usersList.innerHTML = ''
        userList.forEach(user => {
            const $li = document.createElement('li')
            $li.innerHTML = user
            $usersList.append($li)
        })
    }

    const addUser = username => {
        userList.add(username)
        renderUserList()
    }

    const removeUser = username => {
        userList.delete(username)
        renderUserList()
    }

    /**
     * generate KeyId
     * @param {*} socketId 
     * @returns 
     */
    const generateKeyId = socketId => {
        let keyId = ''
        for (let i = 0; i < 2; i++) {
            keyId += socketId.charCodeAt(Math.floor(Math.random() * socketId.length))
        }

        const date = String(Date.now()).slice(-3)

        return Number(keyId + date)
    }

    /**
     * generate registration id & identity key pair
     */
    const generateIdentity = async () => {
        
        // generate registration id
        const registrationId = keyHelper.generateRegistrationId();
        // store registration id
        store.put('registrationId', registrationId)

        // generate identity key pair
        const identityKeyPair = await keyHelper.generateIdentityKeyPair()
        // store identity key pair
        store.put('identityKey', identityKeyPair)
    }

    const generatePreKeys = async  socketId => {

        // generate keyId
        const keyId = generateKeyId(socketId)

        // get identity key pair
        const identityKeyPair = await store.getIdentityKeyPair()

        // generate signed pre key
        const signedPreKey = await keyHelper.generateSignedPreKey(identityKeyPair, keyId)
        // save signed pre key
        store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair)

        // generate pre key
        const preKey = await keyHelper.generatePreKey(keyId)
        // save pre key
        store.storePreKey(preKey.keyId, preKey.keyPair)

        // return key bundle to share with other clients
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

    const buildSession = async (username, keyBundle) => {
        // recipient address
        const address = new libsignal.SignalProtocolAddress(username, deviceId)
        // session builder for that address
        const sessionBuilder = new libsignal.SessionBuilder(store, address)
        // create session
        await sessionBuilder.processPreKey(keyBundle)
        // return session cipher for that address
        return new libsignal.SessionCipher(store, address)
    }


    /**
     * Вывод сообщения.
     * @param {*} message Текст.
     */
    function outputMessage(message) {
        const div = document.createElement('div');
        div.classList.add('message');
        div.innerHTML = `<p class = "meta">${message.username} <span>${message.time}</span></p>
        <p class="text">${message.text}</p>`;
        document.querySelector('.chat-messages').appendChild(div);
    }

    function outputMsg(username, message) {
        const div = document.createElement('div');
        div.classList.add('message');
        var date = new Date();
        var hours = date.getHours();
        var min = date.getMinutes();
        var format = 'PM';
        if (hours > 12){
            format = 'AM';
            hours = hours - 12;
        }
        div.innerHTML = `<p class = "meta">${username} <span>${hours}:${min} ${format}</span></p>
        <p class="text">${message}</p>`;
        document.querySelector('.chat-messages').appendChild(div);
    }
    //запрос на аутенцификацию
    socket.emit('authentication', { username, password });

    //при успешной аутенцификации
    socket.on('authenticated', function () {
        socket.emit('join', { username, password });
    });

    //при неуспешной попытке аутенцификации
    socket.on('unauthorized', function (err) {
        console.log("There was an error with the authentication:", err.message);
        document.location.replace("index.html");
    });

    socket.on('joined', async ()=> {
        // generate identity
        await generateIdentity();
        // generate pre keys
        const keyBundle = await generatePreKeys(socket.id);
        // send key request to other clients
        socket.emit('newSession', keyBundle);
    })

    // when client recives request for new session
    socket.on('newSession', async data => {
        addUser(data.from)
        // generate pre keys
        const keyBundle = await generatePreKeys(socket.id)
        // create session
        sessionCipher[data.from] = await buildSession(data.from, data.body)
        // send own keys to requester
        socket.emit('newSessionReplay', {
            to: data.from,
            body: keyBundle
        })
    })

    // build session from recived keys
    socket.on('newSessionReplay', async data => {
        addUser(data.from)
        sessionCipher[data.from] = await buildSession(data.from, data.body);       
    })

    socket.on('userDisc', async username => {
        removeUser(username);
        await store.removeSession(username + '.' + deviceId);
        delete sessionCipher[username];
    })
    socket.on('message', message =>{
        outputMessage(message);
        ChatMessages.scrollTop = ChatMessages.scrollHeight;
    })

    const sendMessage = async event => {
        event.preventDefault()
        const msg = event.target.elements.msg.value;
        outputMsg('me', msg);
        for (let id in sessionCipher) {
            const encrypted = await sessionCipher[id].encrypt(msg)
            socket.emit('msg', {
                to: id,
                body: encrypted,
            })
        }
        event.target.elements.msg.value = '';
        event.target.elements.msg.focus();
    }
    //получение сообщения
    socket.on('msg', async data => {
        let decrypted;
        // if message is pre key whisper message 
        if (data.body.type === 3) {
            decrypted = await sessionCipher[data.from].decryptPreKeyWhisperMessage(data.body.body, 'binary')
        } else {
            decrypted = await sessionCipher[data.from].decryptWhisperMessage(data.body.body, 'binary')
        }
        outputMsg(data.from, String.fromCharCode.apply(null, new Uint8Array(decrypted)));
        ChatMessages.scrollTop = ChatMessages.scrollHeight;
    })

    //Обработчик нажатия кнопки типа submit
    chatForm.addEventListener('submit', sendMessage);

})()