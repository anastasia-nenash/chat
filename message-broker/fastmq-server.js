const FastMQ = require('fastmq');
const server = FastMQ.Server.create('master', 7500, '0.0.0.0');

server.start().then(() => {
    console.log('Message Broker server started');
});