import {
  cellSelectionFeature, columnFilteringFeature, columnResizingFeature, columnSizingFeature, columnVisibilityFeature, globalFilteringFeature,
  rowSortingFeature, createFilteredRowModel, createSortedRowModel, tableFeatures,
} from '@tanstack/react-table';

export const workbookFeatures = tableFeatures({
  cellSelectionFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});
export type WorkbookFeatures = typeof workbookFeatures;
