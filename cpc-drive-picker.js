// CPC · selector de carpeta de evidencias (Google Picker) v1.0.0 · uso en el panel ADM CPC.
// Google Picker da a la app acceso solo a la carpeta que el admin elige (alcance drive.file).
// Las credenciales (apiKey, appId, token de acceso) se reciben como parámetros; no se guardan aquí.
let pickerReady=null;

function loadPickerApi(){
  if(pickerReady)return pickerReady;
  pickerReady=new Promise((resolve,reject)=>{
    const ready=()=>window.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('No se cargó el selector de Google.')),timeout:10000,ontimeout:()=>reject(new Error('El selector de Google tardó demasiado.'))});
    if(window.gapi?.load){ready();return;}
    const script=document.createElement('script');
    script.src='https://apis.google.com/js/api.js';script.async=true;
    script.onload=ready;script.onerror=()=>reject(new Error('No se pudo cargar Google para el selector.'));
    document.head.append(script);
  }).catch(e=>{pickerReady=null;throw e;});
  return pickerReady;
}

// Abre el selector mostrando solo carpetas. Devuelve {id,name} o null si el admin cancela.
export async function pickEvidenceFolder({apiKey,appId,accessToken}){
  if(!apiKey||!appId||!accessToken)throw new Error('Falta configurar el selector de Google.');
  await loadPickerApi();
  return new Promise(resolve=>{
    const google=window.google;
    const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
    const picker=new google.picker.PickerBuilder()
      .setAppId(appId).setDeveloperKey(apiKey).setOAuthToken(accessToken)
      .addView(view).setTitle('Elige la carpeta de evidencias del curso')
      .setCallback(data=>{
        if(data.action===google.picker.Action.PICKED){const doc=data.docs[0];resolve({id:doc.id,name:doc.name});}
        else if(data.action===google.picker.Action.CANCEL){resolve(null);}
      }).build();
    picker.setVisible(true);
  });
}
