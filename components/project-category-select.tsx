"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const categories = [
  { value: "construction", label: "Construction", initials: "CO", available: true },
  { value: "renovation", label: "Renovation", initials: "RE", available: false },
  { value: "furniture", label: "Furniture & equipment", initials: "FE", available: false },
  { value: "water", label: "Water & sanitation", initials: "WS", available: false },
  { value: "survey", label: "Geophysical survey report", initials: "GS", available: false },
  { value: "teaching", label: "Teaching materials", initials: "TM", available: false },
] as const;

function CategoryIdentity({ category, showAvailability = false }: { category: typeof categories[number]; showAvailability?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar className="size-12 rounded-lg" data-category={category.value} aria-hidden="true">
        <AvatarImage src={`/project-categories/${category.value}.svg`} alt="" width={48} height={48} />
        <AvatarFallback className="rounded-lg">{category.initials}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal text-left">
        <span>{category.label}</span>
        {showAvailability && !category.available && <small className="text-muted-foreground">Coming soon</small>}
      </span>
    </span>
  );
}

export function ProjectCategorySelect({ id, disabled }: { id: string; disabled?: boolean }) {
  // Construction is the only available workflow; the other categories remain discoverable.
  const selectedCategory = categories[0];

  return (
    <Select value={selectedCategory.value} disabled={disabled}>
      <SelectTrigger id={id} className="project-category-trigger w-full">
        <SelectValue><CategoryIdentity category={selectedCategory} /></SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
        <SelectGroup>
          {categories.map((category) => (
            <SelectItem key={category.value} value={category.value} textValue={category.label} disabled={!category.available} className="min-h-16 py-2">
              <CategoryIdentity category={category} showAvailability />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
