'use client';
import {useState} from 'react';
import {Info} from 'lucide-react';
import {Tooltip,TooltipProvider,TooltipTrigger,TooltipContent} from '@/components/ui/tooltip';
export function FieldGuidance({label,text}:{label:string;text:string}){
 const [open,setOpen]=useState(false);
 return <TooltipProvider><Tooltip open={open} onOpenChange={setOpen}><TooltipTrigger asChild><button type="button" className="field-guidance-button" aria-label={label+' guidance'} onClick={event=>{event.preventDefault();setOpen(true);}}><Info size={18} aria-hidden="true"/></button></TooltipTrigger><TooltipContent className="condition-tooltip catalog-field-tooltip" sideOffset={6}>{text}</TooltipContent></Tooltip></TooltipProvider>;
}
