"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useFilters } from "@/app/dashboards/[dashboardId]/filter-context";
import type { SemanticFilter as Filter } from "@/lib/types/filters";
import type { Op } from "@/../semantic-layer/types";

const operatorLabels: Record<Op, string> = {
	eq: "equals",
	neq: "does not equal",
	in: "is one of",
	not_in: "is not one of",
	gt: "greater than",
	gte: "greater than or equal",
	lt: "less than",
	lte: "less than or equal",
	between: "between",
	contains: "contains",
	starts_with: "starts with",
	is_null: "is null",
	is_not_null: "is not null",
};

export function DashboardFilterPane() {
	const {
		filters,
		availableDimensions,
		addFilter,
		removeFilter,
		clearFilters,
		isLoading,
	} = useFilters();

	const [isAddingFilter, setIsAddingFilter] = useState(false);
	const [newFilterField, setNewFilterField] = useState<string>("");
	const [newFilterOp, setNewFilterOp] = useState<Op>("eq");
	const [newFilterValue, setNewFilterValue] = useState<string>("");

	const handleAddFilter = () => {
		if (!newFilterField) return;
		const dimension = availableDimensions.find((d) => d.field === newFilterField);
		if (!dimension) return;

		let values: unknown[] = [];
		if (newFilterOp === "is_null" || newFilterOp === "is_not_null") {
			values = [];
		} else if (newFilterOp === "in" || newFilterOp === "not_in") {
			values = newFilterValue.split(",").map((v) => v.trim()).filter(Boolean);
			if (dimension.type === "number") {
				values = values.map((v) => {
					const n = parseFloat(v as string);
					return Number.isNaN(n) ? v : n;
				});
			}
		} else if (newFilterOp === "between") {
			const parts = newFilterValue.split(",").map((v) => v.trim());
			if (parts.length >= 2) {
				values = parts.slice(0, 2);
				if (dimension.type === "number") {
					values = values.map((v) => parseFloat(v as string));
				}
			}
		} else {
			if (dimension.type === "number") {
				const parsed = parseFloat(newFilterValue);
				if (!isNaN(parsed)) {
					values = [parsed];
				}
			} else {
				values = [newFilterValue];
			}
		}

		const filter: Filter = {
			field: newFilterField,
			op: newFilterOp,
			values,
		};
		addFilter(filter);

		setNewFilterField("");
		setNewFilterOp("eq");
		setNewFilterValue("");
		setIsAddingFilter(false);
	};

	const getOperatorsForType = (type: string): Op[] => {
		switch (type) {
			case "string":
				return ["eq", "neq", "in", "not_in", "contains", "starts_with", "is_null", "is_not_null"];
			case "number":
				return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_null", "is_not_null"];
			case "time":
				return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null"];
			case "boolean":
				return ["eq", "neq", "is_null", "is_not_null"];
			default:
				return ["eq", "neq", "is_null", "is_not_null"];
		}
	};

	const formatFilterValue = (filter: Filter): string => {
		if (!filter.values || filter.values.length === 0) return "";
		return filter.values.join(", ");
	};

	if (isLoading) {
		return <div className="p-4 text-sm text-muted-foreground">Loading filters...</div>;
	}

	return (
		<div className="space-y-6">
			{/* Active Filters */}
			{filters.length > 0 && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<label className="text-sm font-medium">Active Filters</label>
						<Button
							variant="ghost"
							size="sm"
							onClick={clearFilters}
							className="h-auto p-1 text-xs"
						>
							Clear All
						</Button>
					</div>
					<div className="space-y-2">
						{filters.map((filter, index) => {
							const dimension = availableDimensions.find((d) => d.field === filter.field);
							return (
								<div
									key={index}
									className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm"
								>
									<div className="flex-1">
										<span className="font-medium">
											{dimension?.displayName || filter.field}
										</span>
										<span className="text-muted-foreground"> {operatorLabels[filter.op]} </span>
										{filter.values && filter.values.length > 0 && (
											<span className="font-medium">{formatFilterValue(filter)}</span>
										)}
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => removeFilter(index)}
										className="h-auto p-1"
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Add Filter Button */}
			{!isAddingFilter && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => setIsAddingFilter(true)}
					className="w-full"
					disabled={availableDimensions.length === 0}
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Filter
				</Button>
			)}

			{/* Add Filter Form */}
			{isAddingFilter && (
				<div className="space-y-3 rounded-md border p-3">
					<div className="space-y-2">
						<label htmlFor="filter-field" className="text-sm font-medium">
							Field
						</label>
						<Select value={newFilterField} onValueChange={setNewFilterField}>
							<SelectTrigger id="filter-field">
								<SelectValue placeholder="Select field" />
							</SelectTrigger>
							<SelectContent>
								{availableDimensions.map((dim) => (
									<SelectItem key={dim.field} value={dim.field}>
										{dim.displayName} ({dim.exploreName})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{newFilterField && (
						<>
							<div className="space-y-2">
								<label htmlFor="filter-operator" className="text-sm font-medium">
									Operator
								</label>
								<Select
									value={newFilterOp}
									onValueChange={(v) => setNewFilterOp(v as Op)}
								>
									<SelectTrigger id="filter-operator">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{getOperatorsForType(
											availableDimensions.find((d) => d.field === newFilterField)?.type ||
												"string",
										).map((op) => (
											<SelectItem key={op} value={op}>
												{operatorLabels[op]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{newFilterOp !== "is_null" && newFilterOp !== "is_not_null" && (
								<div className="space-y-2">
									<label htmlFor="filter-value" className="text-sm font-medium">
										Value
										{(newFilterOp === "in" ||
											newFilterOp === "not_in" ||
											newFilterOp === "between") && (
											<span className="text-xs text-muted-foreground"> (comma-separated)</span>
										)}
									</label>
									<Input
										id="filter-value"
										value={newFilterValue}
										onChange={(e) => setNewFilterValue(e.target.value)}
										placeholder={
											newFilterOp === "in" || newFilterOp === "not_in"
												? "value1, value2, value3"
												: newFilterOp === "between"
													? "min, max"
													: "Enter value"
										}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleAddFilter();
											}
										}}
									/>
								</div>
							)}
						</>
					)}

					<div className="flex gap-2">
						<Button
							variant="default"
							size="sm"
							onClick={handleAddFilter}
							disabled={
								!newFilterField ||
								(!newFilterValue && newFilterOp !== "is_null" && newFilterOp !== "is_not_null")
							}
							className="flex-1"
						>
							Add
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setIsAddingFilter(false);
								setNewFilterField("");
								setNewFilterOp("eq");
								setNewFilterValue("");
							}}
							className="flex-1"
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			{/* Empty State */}
			{availableDimensions.length === 0 && (
				<p className="text-sm italic text-muted-foreground">
					No filterable dimensions available. Charts must use the semantic layer to enable filtering.
				</p>
			)}
		</div>
	);
}


