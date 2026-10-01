"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sportsSections, type SportsSection } from "@/lib/sports";

const initials: Record<SportsSection, string> = { equipment: "SE", competitions: "SC", publicity: "PA", supervision: "SV" };

function SectionIdentity({ section }: { section: typeof sportsSections[number] }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar className="size-12 rounded-lg" aria-hidden="true">
        <AvatarImage src={`/sports-sections/${section.id}.svg`} alt="" width={48} height={48} />
        <AvatarFallback className="rounded-lg">{initials[section.id]}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col whitespace-normal text-left"><span>{section.label}</span><small className="text-muted-foreground">{section.share}% indicative share</small></span>
    </span>
  );
}

export function SportsSectionSelect({ id, value, onValueChange, disabled }: {
  id: string;
  value: SportsSection;
  onValueChange: (value: SportsSection) => void;
  disabled?: boolean;
}) {
  const selectedSection = sportsSections.find((section) => section.id === value) ?? sportsSections[0];

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="project-category-trigger w-full">
        <SelectValue><SectionIdentity section={selectedSection} /></SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
        <SelectGroup>
          {sportsSections.map((section) => (
            <SelectItem key={section.id} value={section.id} textValue={section.label} className="min-h-16 py-2">
              <SectionIdentity section={section} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
