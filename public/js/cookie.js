/**
		 * Установка кук.
		 **/
 function setCookie(name, value, props) {
    props = props || {}
    var exp = props.expires
    if (typeof exp == "number" && exp) {
        var d = new Date()
        d.setTime(d.getTime() + exp * 1000)
        exp = props.expires = d
    }
    if (exp && exp.toUTCString) { props.expires = exp.toUTCString() }
    value = encodeURIComponent(value)
    var updatedCookie = name + "=" + value
    for (var propName in props) {
        updatedCookie += "; " + propName
        var propValue = props[propName]
        if (propValue !== true) { updatedCookie += "=" + propValue }
    }
    document.cookie = updatedCookie
}

function onJoinButtonClick() {
    var usernameS = 'username';
    var passwordS = 'password';
    var username = document.getElementById(usernameS).value;
    var password = document.getElementById(passwordS).value;
    setCookie(usernameS,username,{});
    setCookie(passwordS,password,{});
    location.href = '/chat.html';
}