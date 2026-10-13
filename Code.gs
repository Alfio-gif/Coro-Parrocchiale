// Coro San Michele - script di sincronizzazione con Google Drive
const FILE_NAME = 'coro-data.json';
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
function backup(f){
  const fo=DriveApp.getFoldersByName('coro-backup');
  const dir=fo.hasNext()?fo.next():DriveApp.createFolder('coro-backup');
  const L=[],it=dir.getFiles();
  while(it.hasNext())L.push(it.next());
  L.sort((a,b)=>b.getDateCreated()-a.getDateCreated());
  if(!L.length||new Date()-L[0].getDateCreated()>6*3600*1000){
    f.makeCopy('backup-'+Utilities.formatDate(new Date(),'Europe/Rome','yyyyMMdd-HHmmss')+'.json',dir);
    L.slice(9).forEach(x=>x.setTrashed(true));
  }
}

// Vista Corista: i numeri di telefono NON vengono mai inviati
function doGet(){
  const d=leggi();
  d.coristi=(d.coristi||[]).map(c=>{const x=Object.assign({},c);delete x.tel;return x;});
  return out({ok:true,data:d});
}
function doPost(e){
  const r=JSON.parse(e.postData.contents);
  if(!okPwd(r.pwd))return out({ok:false,err:'pwd'});
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
