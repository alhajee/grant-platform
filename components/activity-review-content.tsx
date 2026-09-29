import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function EditComponentButton({href,label}:{href:string;label:string}){
 return <Button asChild variant="outline" size="icon-lg" className="rounded-full"><a href={href} aria-label={`Edit ${label}`} title={`Edit ${label}`}><PencilIcon data-icon="inline-start" /></a></Button>;
}
