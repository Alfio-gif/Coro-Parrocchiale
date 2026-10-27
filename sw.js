const C='coro-v2';
const Q=new URL(self.location.href).searchParams;
// Notifiche push (Firebase): attive solo se l'app passa la configurazione
if(Q.get('apiKey')){
  try{
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp({apiKey:Q.get('apiKey'),authDomain:Q.get('authDomain'),projectId:Q.get('projectId'),messagingSenderId:Q.get('messagingSenderId'),appId:Q.get('appId')});
    firebase.messaging().onBackgroundMessage(p=>{
      const d=p.data||{};
      return self.registration.showNotification(d.title||'Coro San Michele',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',data:{url:d.url||'./'}});
    });
  }catch(e){}
}
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(L=>{
    for(const c of L){if('focus' in c)return c.focus();}
    return clients.openWindow((e.notification.data&&e.notification.data.url)||'./');
  }));
});
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','favicon.ico','icon-192.png'])).catch(()=>{}))});
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request)));
});
