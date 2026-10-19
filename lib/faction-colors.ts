const named:Record<string,{backgroundColor:string;borderColor:string}>={
 'gijoe':{backgroundColor:'#e8edd8',borderColor:'#a8b681'},
 'cobra':{backgroundColor:'#e4ecfa',borderColor:'#9aafd2'},
 'dreadnoks':{backgroundColor:'#f8e8d9',borderColor:'#d6ae87'},
 'irongrenadiers':{backgroundColor:'#f7efcc',borderColor:'#ccbb70'},
 'oktoberguard':{backgroundColor:'#f5e0e3',borderColor:'#ce9da6'},
};
export function factionColors(name:string){
 const key=name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(named[key])return named[key];
 let hash=0;for(const char of name.trim().normalize('NFC').toLowerCase())hash=(hash*31+char.codePointAt(0)!)>>>0;
 const hue=hash%360;return {backgroundColor:`hsl(${hue} 45% 93%)`,borderColor:`hsl(${hue} 25% 68%)`};
}
