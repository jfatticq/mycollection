// Credentials are accepted only on hidden stdin and never written to disk.
const projectId='appgprj_6ac1cede871881919ac1c3b25bf1a6c5';
const origin='https://jeffs-joe-armory.jfattic.chatgpt.site';
async function input() {
  return new Promise((resolve,reject)=>{
    let text='';const terminal=process.stdin.isTTY;
    const done=(error)=>{process.stdin.off('data',read);process.stdin.off('end',end);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(text)};
    const read=(chunk)=>{text+=chunk;if(text.includes('\u0003'))done(Error('Cancelled'));else if(text.length>8192)done(Error('Input too large'));else if(/[\r\n]/.test(text))done()};
    const end=()=>done();if(terminal){process.stdin.setRawMode(true);console.error('Ready for migration JSON on stdin (input is hidden).')}
    process.stdin.setEncoding('utf8');process.stdin.on('data',read);process.stdin.once('end',end);process.stdin.resume();
  });
}
try {
  const config=JSON.parse(await input());
  if(!['status','clear','drain','finalize'].includes(config.action)||typeof config.serviceToken!=='string'||!config.serviceToken||!/^[0-9a-f]{64}$/.test(config.resetToken))throw Error('Invalid controlled migration input');
  for(let batch=0;batch<(config.action==='drain'?10:1);batch++) {
    const result=await fetch(origin+'/__migration/step5',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+config.serviceToken,Authorization:'Bearer '+config.resetToken},body:JSON.stringify({project_id:projectId,d1:'DB',r2:'BUCKET',action:config.action==='drain'?'clear':config.action})});
    const body=await result.json();console.log(JSON.stringify({status:result.status,body}));
    if(!result.ok){process.exitCode=1;break}if(body.filesEmpty)break;
  }
}catch(error){console.error('Controlled migration request failed: '+(error.cause?.code||error.message));process.exitCode=1}
