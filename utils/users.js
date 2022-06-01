const users = [];


function userJoin(id,username, password, room){
    const user = {id, username, password, room};
    users.push(user);
    return user;
}


function getCurrentUser(id){
    return users.find(user => user.id === id);
}

function userLeave(id){
    const index = users.findIndex(user => user.id ===id);

    if(index !== -1){
        
        return users.splice(index, 1);
    }

}

function getRoomUsers(room) {
    return users.filter(user => user.room === room);
}

const findByUsername = username => users.find(user => user.username === username);

module.exports = {
    userJoin,
    getCurrentUser,
    userLeave,
    findByUsername,
    getRoomUsers
};