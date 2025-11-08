"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type DashboardFiltersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters?: () => void;
  onClearFilters?: () => void;
};

export function DashboardFiltersSheet({
  open,
  onOpenChange,
  onApplyFilters,
  onClearFilters,
}: DashboardFiltersSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto p-4">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Apply filters to all charts on this dashboard
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <label htmlFor="date-range-start" className="text-sm font-medium">
              Date Range
            </label>
            <div className="flex gap-2">
              <Input id="date-range-start" type="date" placeholder="Start date" />
              <Input id="date-range-end" type="date" placeholder="End date" />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="category-filter" className="text-sm font-medium">
              Category
            </label>
            <Select>
              <SelectTrigger id="category-filter">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="operations">Operations</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="region-filter" className="text-sm font-medium">
              Region
            </label>
            <Select>
              <SelectTrigger id="region-filter">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="north">North</SelectItem>
                <SelectItem value="south">South</SelectItem>
                <SelectItem value="east">East</SelectItem>
                <SelectItem value="west">West</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="status-filter" className="text-sm font-medium">
              Status
            </label>
            <Select>
              <SelectTrigger id="status-filter">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="search-filter" className="text-sm font-medium">
              Search
            </label>
            <Input id="search-filter" type="text" placeholder="Search by keyword..." />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="default"
              className="flex-1"
              onClick={onApplyFilters}
            >
              Apply Filters
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClearFilters}
            >
              Clear All
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

