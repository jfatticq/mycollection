export function archiveFigureURL(value:string){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.yojoe.com'&&/^\/action\/\d{2}\/[a-z0-9_-]+\.shtml$/i.test(u.pathname)?u.href:null;}catch{return null;}}
export function parseVersions(html:string){
 const body=html.match(/<h[23][^>]*>\s*Versions of[^<]*<\/h[23]>([\s\S]*?)(?=<h[23][^>]*>\s*Reference Information|$)/i)?.[1]||'';
 const versions=new Map<string,{url:string;label:string;year:number}>();
 for(const m of body.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi)){
  const raw=m[1].match(/title="(https:\/\/www.yojoe.com\/action\/[^\"]+)"/i)?.[1]||m[1].match(/href="([^\"]+)"/i)?.[1];if(!raw)continue;
  const url=archiveFigureURL(new URL(raw,'https://www.yojoe.com').href);if(!url)continue;
  const label=(m[2].match(/alt="([^\"]+)"/i)?.[1]||m[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim(),year=Number(label.match(/\b(19\d{2}|20\d{2})\b/)?.[1]);
  if(label&&year)versions.set(url,{url,label,year});
 }
 return [...versions.values()];
}
