let selectTab = document.getElementById('selectThisTab');
let stopTab = document.getElementById('stopThisTab');

function getTab (){
    return new Promise(function(resolve, reject){
        chrome.storage.sync.get('selectedTab',function (data) {
        tabId =  data.selectedTab;
    });
    });
}

selectTab.onclick = function(element){
    function setTabId(tabs) {
        var currentTab = tabs[0];
        chrome.storage.sync.set({selectedTab: currentTab.id});
    }
var query = { active: true, currentWindow: true };
    chrome.tabs.query(query, setTabId);
    chrome.alarms.create('reloadTabAlarm', {when:Date.now(), periodInMinutes: 0.2});
     getTab().then(function(tab){
        var tabId = tab;
        alert("tab selected");
     }).catch(function(error){
        alert("something went wrong");
     });
};

stopTab.onclick = function (element) {
  chrome.alarms.clear('reloadTabAlarm', function(wasCleared) {
    if(wasCleared) {
      alert("tab removed from auto reload");
    } else{
      alert("failed please try again");
    }
  });
};
