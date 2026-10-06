'use client';
import { useState } from 'react';
import { Tooltip,TooltipProvider,TooltipTrigger,TooltipContent } from '@/components/ui/tooltip';
export function ConditionGuide({text}:{text:string}){const [open,setOpen]=useState(false);return <TooltipProvider><Tooltip open={open} onOpenChange={setOpen}><TooltipTrigger asChild><button type="button" className="outline" aria-label="Condition guidance" onClick={()=>setOpen(!open)}>Condition guidance</button></TooltipTrigger><TooltipContent className="condition-tooltip" sideOffset={6}>{text}</TooltipContent></Tooltip></TooltipProvider>;}
