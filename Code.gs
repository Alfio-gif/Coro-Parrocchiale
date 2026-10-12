// Coro San Michele - script di sincronizzazione con Google Drive
const FILE_NAME = 'coro-data.json';
const PASSWORD_INIZIALE = 'coro123'; // cambiala subito dall'app (Admin > Cambia password)

function sha(s){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s));}
function file(){
  const it=DriveApp.getFilesByName(FILE_NAME);
  if(it.hasNext())return it.next();
  return DriveApp.createFile(FILE_NAME,JSON.stringify({comm:{text:'',date:''},logo:'',canti:[],scalette:[],coristi:[]}),'application/json');
}
function okPwd(p){
  const h=PropertiesService.getScriptProperties().getProperty('h')||sha(PASSWORD_INIZIALE);
  return sha(p||'')===h;
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function leggi(){return JSON.parse(file().getBlob().getDataAsString()||'{}');}

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
  if(r.a==='save'){file().setContent(JSON.stringify(r.data));return out({ok:true});}
  if(r.a==='chpwd'){PropertiesService.getScriptProperties().setProperty('h',sha(r.np));return out({ok:true});}
  return out({ok:false});
}
