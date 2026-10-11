// backend/cpcInstructorHttp.js · v1.0.0
// Se invoca mediante Wix REST /velo/v1/http/invoke/cpcInstructor con OAuth de miembro.
import { response } from 'wix-http-functions';
import { instructorAcademic } from 'backend/cpcCursosAdmin.web';
export async function cpcInstructorHttp(request) {
    const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
    try {
        const body=await request.body.json();
        const action=String(body?.action || '');
        const data=await instructorAcademic(action,body?.input || {});
        return response({status:200,headers,body:JSON.stringify({ok:true,data})});
    } catch(error) {
        console.warn('CPC Instructor HTTP v1.0.0:',error?.message);
        return response({status:400,headers,body:JSON.stringify({ok:false,message:error?.message || 'No fue posible completar la operación.'})});
    }
}
