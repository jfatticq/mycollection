'use client';
import type {ButtonHTMLAttributes} from 'react';
import {X} from 'lucide-react';
export function RemoveIconButton({label,...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'|'type'|'aria-label'> & {label:string}){
 return <button {...props} type="button" className={'remove-icon-button '+(props.className??'')} aria-label={label} title={props.title??label}><X size={14} strokeWidth={2.5} aria-hidden="true"/></button>;
}
