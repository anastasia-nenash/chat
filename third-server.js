const http = require('http');
const server = http.createServer();
const FastMQ = require('fastmq');
const express = require("express");
const app = express();
const { subtle } = require('node:crypto').webcrypto;
const keys = [];
var id = 1;
const messages = [];

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

const pack = buffer => btoa(
    String.fromCharCode.apply(null, new Uint8Array(buffer))
)

function shuffle(array) {
    var j, x, i;
    for (i = array.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = array[i];
        array[i] = array[j];
        array[j] = x;
    }
    return array;
}

FastMQ.Client.connect('thirdServerChannel', 7500, 'localhost')
    .then((channel) => {
        channel.response('getMessageFromSecondServer', async (msq, res) => {
            var responseFromSecondServer = msq.payload.data;
            var privateKey;

            keys.forEach(element => {
                if (element.id == responseFromSecondServer.secondId){
                    privateKey = element.key;
                }
            });

            responseFromSecondServer.to = await decrypt(unpack(responseFromSecondServer.to), privateKey, unpack(responseFromSecondServer.iv));
            responseFromSecondServer.from = await decrypt(unpack(responseFromSecondServer.from), privateKey, unpack(responseFromSecondServer.iv));
            
            messages.push(responseFromSecondServer);
            
            if (messages.length == 3) {
                shuffle(messages);
                for (let i = 0; i < messages.length; i++) {
                    let reqPayload = {data: messages[i]}
                    channel.request('firstServerChannel', 'getMessageFromThirdServer', reqPayload, 'json');
                }

                messages.splice(0, 3);
            }  
        });
    })
    .catch((err) => {
        console.log('Got error:', err.stack);
    });

const PORT = 3003 || process.env.PORT;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));