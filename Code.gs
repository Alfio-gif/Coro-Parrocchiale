// Coro San Michele - sincronizzazione con Google Drive + notifiche push (Firebase)
const FILE_NAME = 'coro-data.json';
const TOKENS_FILE = 'coro-push.json'; // identificativi dei telefoni che hanno attivato le notifiche
const PASSWORD_INIZIALE = 'cambiami'; // usata solo finché non cambi la password dall'app

function sha(s){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s));}
function file(){
  const it=DriveApp.getFilesByName(FILE_NAME);
  if(it.hasNext())return it.next();
  return DriveApp.createFile(FILE_NAME,JSON.stringify({v:0,comm:{text:'',date:''},logo:'',canti:[],scalette:[],coristi:[]}),'application/json');
}
function okPwd(p){
  const h=PropertiesService.getScriptProperties().getProperty('h')||sha(PASSWORD_INIZIALE);
  return sha(p||'')===h;
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function leggi(){return JSON.parse(file().getBlob().getDataAsString()||'{}');}

// Copia di sicurezza in Drive (cartella "coro-backup"): al massimo una ogni 6 ore, ne restano 10
function backup(f,force){
  const fo=DriveApp.getFoldersByName('coro-backup');
  const dir=fo.hasNext()?fo.next():DriveApp.createFolder('coro-backup');
  const L=[],it=dir.getFiles();
  while(it.hasNext())L.push(it.next());
  L.sort((a,b)=>b.getDateCreated()-a.getDateCreated());
  if(force||!L.length||new Date()-L[0].getDateCreated()>6*3600*1000){
    f.makeCopy('backup-'+Utilities.formatDate(new Date(),'Europe/Rome','yyyyMMdd-HHmmss')+'.json',dir);
    L.slice(9).forEach(x=>x.setTrashed(true));
  }
}

function bkFiles(){const fo=DriveApp.getFoldersByName('coro-backup');if(!fo.hasNext())return [];const L=[],it=fo.next().getFiles();while(it.hasNext())L.push(it.next());L.sort((a,b)=>b.getDateCreated()-a.getDateCreated());return L;}

// ---------- Notifiche push (Firebase Cloud Messaging) ----------
function autorizza(){UrlFetchApp.fetch('https://www.google.com');DriveApp.getRootFolder();} // eseguila una volta dall'editor per concedere i permessi
function tokFile(){const it=DriveApp.getFilesByName(TOKENS_FILE);return it.hasNext()?it.next():DriveApp.createFile(TOKENS_FILE,'[]','application/json');}
function tokens(){try{return JSON.parse(tokFile().getBlob().getDataAsString()||'[]');}catch(e){return [];}}
function saveTokens(t){tokFile().setContent(JSON.stringify(t));}
function b64(x){return Utilities.base64EncodeWebSafe(x).replace(/=+$/,'');}
function getSA(){
  const v=PropertiesService.getScriptProperties().getProperty('SA');
  if(!v)throw new Error('Chiave Firebase mancante: aggiungi la proprietà SA nello script');
  return JSON.parse(v);
}
function accessToken(){
  const c=CacheService.getScriptCache(),k=c.get('fcm');
  if(k)return k;
  const sa=getSA(),now=Math.floor(Date.now()/1000);
  const h=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const p=b64(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const sig=b64(Utilities.computeRsaSha256Signature(h+'.'+p,sa.private_key));
  const r=UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{method:'post',payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:h+'.'+p+'.'+sig},muteHttpExceptions:true});
  const j=JSON.parse(r.getContentText());
  if(!j.access_token)throw new Error('Autenticazione Firebase non riuscita: controlla la proprietà SA');
  c.put('fcm',j.access_token,3000);
  return j.access_token;
}
function sendPush(title,body){
  const sa=getSA(),tk=tokens();
  if(!tk.length)return {ok:true,sent:0,failed:0};
  const at=accessToken(),url='https://fcm.googleapis.com/v1/projects/'+sa.project_id+'/messages:send';
  const reqs=tk.map(t=>({url:url,method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+at},muteHttpExceptions:true,
    payload:JSON.stringify({message:{token:t,data:{title:title,body:body,url:'./'},webpush:{headers:{Urgency:'high',TTL:'86400'}}}})}));
  const res=UrlFetchApp.fetchAll(reqs);let ok=0;const dead=[];
  res.forEach((r,i)=>{const c=r.getResponseCode();if(c===200)ok++;else if(c===404||/UNREGISTERED/.test(r.getContentText()))dead.push(tk[i]);});
  if(dead.length){const L=LockService.getScriptLock();L.waitLock(15000);try{saveTokens(tokens().filter(x=>dead.indexOf(x)<0));}finally{L.releaseLock();}}
  return {ok:true,sent:ok,failed:tk.length-ok};
}

// Vista Corista: i numeri di telefono NON vengono mai inviati
function doGet(){
  const d=leggi();
  delete d.prove; // le presenze sono visibili solo all'Admin
  d.coristi=(d.coristi||[]).map(c=>{
    const x=Object.assign({},c);
    if(x.pin){x.prot=true;delete x.audio;delete x.spartito;delete x.testo;delete x.nota;} // sezione protetta da PIN
    delete x.pin;delete x.tel;return x;
  });
  return out({ok:true,data:d});
}
function doPost(e){
  const r=JSON.parse(e.postData.contents);
  if(r.a==='sec'){ // sblocco sezione personale con PIN
    const c=(leggi().coristi||[]).find(x=>x.id===r.id);
    return (c&&c.pin&&String(c.pin)===String(r.pin))?out({ok:true,s:{audio:c.audio,spartito:c.spartito,testo:c.testo,nota:c.nota}}):out({ok:false});
  }
  if(r.a==='reg'||r.a==='unreg'){ // registrazione del telefono per le notifiche
    const t0=String(r.token||'');
    if(t0.length<50||t0.length>500)return out({ok:false});
    const L=LockService.getScriptLock();L.waitLock(15000);
    try{
      let t=tokens();
      if(r.a==='reg'){if(t.indexOf(t0)<0){if(t.length>=500)return out({ok:false});t.push(t0);saveTokens(t);}}
      else{saveTokens(t.filter(x=>x!==t0));}
    }finally{L.releaseLock();}
    return out({ok:true});
  }
  if(!okPwd(r.pwd))return out({ok:false,err:'pwd'});
  if(r.a==='push'){
    try{return out(sendPush(String(r.title||'Coro San Michele').slice(0,80),String(r.body||'').slice(0,300)));}
    catch(e){return out({ok:false,err:String(e.message||e)});}
  }
  if(r.a==='bklist'){ // elenco delle copie di sicurezza
    return out({ok:true,l:bkFiles().map(f=>{let c=0,s=0;try{const x=JSON.parse(f.getBlob().getDataAsString());c=(x.canti||[]).length;s=(x.scalette||[]).length;}catch(e){}return {id:f.getId(),d:Utilities.formatDate(f.getDateCreated(),'Europe/Rome','dd/MM/yyyy HH:mm'),c:c,s:s};})});
  }
  if(r.a==='restore'){ // ripristino: prima salva una copia dei dati attuali
    const b=bkFiles().find(x=>x.getId()===r.id);if(!b)return out({ok:false,err:'nobk'});
    const L=LockService.getScriptLock();L.waitLock(15000);
    try{
      const d=JSON.parse(b.getBlob().getDataAsString()),f=file(),cur=JSON.parse(f.getBlob().getDataAsString()||'{}');
      backup(f,true);d.v=(cur.v||0)+1;f.setContent(JSON.stringify(d));
      return out({ok:true,v:d.v,data:d});
    }finally{L.releaseLock();}
  }
  if(r.a==='get')return out({ok:true,admin:true,data:leggi()});
  if(r.a==='save'){
    const f=file(),cur=JSON.parse(f.getBlob().getDataAsString()||'{}');
    if(!r.force&&(cur.v||0)!==(r.base||0))return out({ok:false,err:'conflict'});
    backup(f);
    r.data.v=(cur.v||0)+1;
    f.setContent(JSON.stringify(r.data));
    return out({ok:true,v:r.data.v});
  }
  if(r.a==='chpwd'){PropertiesService.getScriptProperties().setProperty('h',sha(r.np));return out({ok:true});}
  return out({ok:false});
}
