const chatForm = document.getElementById('chat-form');
const ChatMessages = document.querySelector('.chat-messages');
var username = getCookie("username");
var password = getCookie("password");

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
 * Вывод сообщения.
 * @param {*} message Текст.
 */
function outputMessage(message){
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = `<p class = "meta">${message.username} <span>${message.time}</span></p>
    <p class="text">${message.text}</p>`;
    document.querySelector('.chat-messages').appendChild(div);
}

const socket = io();
socket.on('connect', function () {

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

    //получение сообщения
    socket.on('message', message => {
        console.log(message);
        outputMessage(message);

        ChatMessages.scrollTop = ChatMessages.scrollHeight;
    })

    //Обработчик нажатия кнопки типа submit
    chatForm.addEventListener('submit', e => {
        e.preventDefault();
        const msg = e.target.elements.msg.value;
        socket.emit('ChatMessage', msg);

        e.target.elements.msg.value = '';
        e.target.elements.msg.focus();

    })
});
