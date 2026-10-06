'use client';
import {useEffect,useState} from 'react';
import {requestJSON} from '@/lib/api-client';
import {ZoomableImage} from '@/components/zoomable-image';
type Gallery={source?:string;images:{key:string;caption:string;credit:string}[]};
export function AccessoryGallery({releaseId,fallbackSource}:{releaseId:string;fallbackSource:string}){
 const [gallery,setGallery]=useState<Gallery|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let current=true;setGallery(null);setError('');requestJSON('/api/accessory-images?id='+encodeURIComponent(releaseId),{},true).then(d=>{if(current)setGallery(d);}).catch(e=>{if(current)setError(e.message||'Photo references unavailable.');});return()=>{current=false;};},[releaseId,retry]);
 return <section className="accessory-photo-section"><h3>Accessory photo references</h3><p>Reference examples for this release; your parts may show different wear. Captions and credits come from the source.</p>{!gallery&&!error&&<p role="status">Loading accessory photos…</p>}{error&&<p role="alert">{error} <a href="#" role="button" onClick={e=>{e.preventDefault();setRetry(n=>n+1);}}>Retry</a> · <a href={fallbackSource} target="_blank" rel="noreferrer">View source photos</a></p>}{gallery?.images.length?<div className="accessory-photo-grid">{gallery.images.map(p=>{const src='/api/accessory-image?id='+encodeURIComponent(releaseId)+'&photo='+p.key;return <ZoomableImage key={p.key} src={src} fullSrc={src+'&size=full'} title={p.caption} source={gallery.source||fallbackSource} credit={p.credit}/>;})}</div>:gallery&&<p>No accessory photos are connected to this exact release yet. <a href={fallbackSource} target="_blank" rel="noreferrer">View photos at the release source</a>.</p>}</section>;
}
