const chatForm = document.getElementById('chat-form');
const ChatMessages = document.querySelector('.chat-messages');

const {username, password} = Qs.parse(location.search,{
    ignoreQueryPrefix: true
}); 

const socket = io();

socket.emit('join',{username,password});

socket.on('message', message => {
    console.log(message);
    outputMessage(message);

    ChatMessages.scrollTop = ChatMessages.scrollHeight;
})

chatForm.addEventListener('submit', e =>{
    e.preventDefault();
    const msg = e.target.elements.msg.value;
    socket.emit('ChatMessage', msg);

    e.target.elements.msg.value = '';
    e.target.elements.msg.focus();

})

function outputMessage(message){
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = `<p class = "meta">${message.username} <span>${message.time}</span></p>
    <p class="text">${message.text}</p>`;
    document.querySelector('.chat-messages').appendChild(div);
}