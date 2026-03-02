/**
 * 点赞JS
*/
(function(){
  const ApiUrl = '/api/like';
  const UrlKey = window.location.host + window.location.pathname;
  const MaxLike = 5;
  window.url = window.location.host + window.location.pathname;
  window.flag = 0;

  function getCookie(name) {
    return document.cookie.split(';').map(c => c.trim())
      .find(c => c.startsWith(name + '='))?.slice(name.length + 1) || null;
  }
  function setCookie(name, value, days) {
    var date = new Date();
    date.setTime(date.getTime() + days*24*60*60*1000);
    var expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
  }
  function updateZanText(num) {
    var el = document.getElementById("zan_text");
    if (el) el.innerHTML = num;
  }
  function showAlert(msg) {
    var alertBox = document.createElement("div");
    alertBox.innerText = msg;
    alertBox.style.position = "fixed";
    alertBox.style.top = "20%";
    alertBox.style.left = "50%";
    alertBox.style.transform = "translate(-50%, -50%)";
    alertBox.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
    alertBox.style.color = "white";
    alertBox.style.padding = "15px 30px";
    alertBox.style.borderRadius = "8px";
    alertBox.style.zIndex = "1000";
    alertBox.style.fontSize = "16px";
    alertBox.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.2)";
    document.body.appendChild(alertBox);
    setTimeout(function () {
      document.body.removeChild(alertBox);
    }, 1800);
  }
  function heartAnimation() {
    var heart = document.querySelector('.heart');
    if (!heart) return;
    heart.classList.remove('heartAnimation');
    void heart.offsetWidth;
    heart.classList.add('heartAnimation');
    setTimeout(function(){
      heart.classList.remove('heartAnimation');
    },800);
  }
  function getVisitorLikes(url) {
    var likes = getCookie("likes_" + url);
    return likes ? parseInt(likes) : 0;
  }
  function setVisitorLikes(url, likes) {
    setCookie("likes_" + url, likes, 30);
  }
  function postLike(targetUrl, addOne, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", ApiUrl, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var response = JSON.parse(xhr.responseText);
            callback(response);
          } catch (e) {
            callback({ error: '解析 JSON 失败' });
          }
        } else {
          callback({ error: '请求失败', status: xhr.status });
        }
      }
    };

    var data = JSON.stringify({
      Url: targetUrl, 
      Add: addOne ? 1 : 0
    });
    xhr.send(data);
  }
  
  window.goodplus = function(u, f) {
    var targetUrl = u || UrlKey; 
    var currentLikes = getVisitorLikes(targetUrl);
    
    if (currentLikes >= MaxLike) {
      showAlert("最多只能点 " + MaxLike + " 个赞");
      return;
    }
    
    postLike(targetUrl, true, function(d) {
      if(typeof d.likes!=="undefined") {
        updateZanText(d.likes);
        setVisitorLikes(targetUrl, currentLikes + 1);
        showAlert("点赞成功");
      } else {
        showAlert("后端请求失败,请稍后再试");
      }
    });
    heartAnimation();
  };
  
  document.addEventListener('DOMContentLoaded', function(){
    postLike(UrlKey, false, function(d) {
      if(typeof d.likes!=="undefined") updateZanText(d.likes);
    });
  });
})();