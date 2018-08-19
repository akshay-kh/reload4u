let selectTab = document.getElementById('selectThisTab');

selectTab.onclick = function(element){
    function setTabId(tabs) {
        var currentTab = tabs[0];
        chrome.storage.sync.set({selectedTab: currentTab.id});
    }
var query = { active: true, currentWindow: true };
    chrome.tabs.query(query, setTabId);
    chrome.alarms.create('reloadTabAlarm', {delayInMinutes: 0.1, periodInMinutes: 0.2});
     getTab().then(function(tab){
        var tabId = tab;
     }).catch(function(error){
        alert("something went wrong");
     });
    alert("tab stored "+tabId);
};

function getTab (){
    return new Promise(function(resolve, reject){
        chrome.storage.sync.get('selectedTab',function (data) {
        tabId =  data.selectedTab;
    });
    });
}
