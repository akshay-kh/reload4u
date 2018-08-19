chrome.runtime.onInstalled.addListener(function() {
    function getTab (){
        return new Promise(function(resolve, reject){
                chrome.storage.sync.get('selectedTab',function (data) {
                tabId =  data.selectedTab;
            });
        });
    }

    function reloadTab(){
      getTab().then(function(tab){
        var tabId = tab;
     }).catch(function(error){
        alert("something went wrong");
     });
     chrome.tabs.reload(tabId);
    }
    chrome.alarms.onAlarm.addListener(function(alarm) {
        reloadTab();
    });
});
