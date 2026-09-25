import {
  columnFilteringFeature, columnVisibilityFeature, rowPaginationFeature,
  rowSortingFeature, createFilteredRowModel, createPaginatedRowModel,
  createSortedRowModel, filterFn_includesString, sortFn_text, tableFeatures,
} from '@tanstack/react-table';

export const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { text: sortFn_text },
});
export type DataTableFeatures = typeof features;
