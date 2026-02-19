"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import { normalizeFilterPayload } from "@/lib/filters/normalize-filters";
import type { AvailableDimension, Filter } from "@/lib/types/filters";

interface FilterContextValue {
	filters: Filter[];
	availableDimensions: AvailableDimension[];
	addFilter: (filter: Filter) => void;
	removeFilter: (index: number) => void;
	updateFilter: (index: number, filter: Filter) => void;
	clearFilters: () => void;
	isLoading: boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({
	dashboardId,
	children,
}: {
	dashboardId: string;
	children: ReactNode;
}) {
	const [filters, setFilters] = useState<Filter[]>([]);
	const [availableDimensions, setAvailableDimensions] = useState<AvailableDimension[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Load available dimensions from API on mount
	useEffect(() => {
		let cancelled = false;

		async function loadDimensions() {
			setIsLoading(true);
			try {
				const res = await fetch(`/api/dashboard/${dashboardId}/dimensions`);
				if (!res.ok) {
					throw new Error(`Failed to load dimensions: ${res.statusText}`);
				}
				const data = await res.json();
				if (!cancelled) {
					setAvailableDimensions(Array.isArray(data.dimensions) ? data.dimensions : []);
					if (data.message) {
						console.log(`[Filters] ${data.message}`);
					}
				}
			} catch (error) {
				console.error("[Filters] Failed to load dimensions:", error);
				if (!cancelled) {
					setAvailableDimensions([]);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		loadDimensions();
		return () => {
			cancelled = true;
		};
	}, [dashboardId]);

	// Load filters from localStorage on mount
	useEffect(() => {
		const key = `dashboard_${dashboardId}_filters`;
		const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				const normalized = normalizeFilterPayload(parsed);
				setFilters(normalized);
				console.log(`[Filters] Loaded ${normalized.length} saved filter(s)`);
			} catch (error) {
				console.error("[Filters] Failed to parse saved filters:", error);
				// Clear invalid data
				localStorage.removeItem(key);
			}
		}
	}, [dashboardId]);

	// Persist filters to localStorage whenever they change
	useEffect(() => {
		const key = `dashboard_${dashboardId}_filters`;
		try {
			if (filters.length > 0) {
				localStorage.setItem(key, JSON.stringify(filters));
				console.log(`[Filters] Saved ${filters.length} filter(s) to localStorage`);
			} else {
				localStorage.removeItem(key);
			}
		} catch (error) {
			console.error("[Filters] Failed to save filters:", error);
		}
	}, [filters, dashboardId]);

	const addFilter = (filter: Filter) => {
		setFilters((prev) => {
			const next = [...prev, filter];
			console.log("[Filters] Added filter:", filter);
			return next;
		});
	};

	const removeFilter = (index: number) => {
		setFilters((prev) => {
			const removed = prev[index];
			const next = prev.filter((_, i) => i !== index);
			console.log("[Filters] Removed filter:", removed);
			return next;
		});
	};

	const updateFilter = (index: number, filter: Filter) => {
		setFilters((prev) => {
			const next = prev.map((f, i) => (i === index ? filter : f));
			console.log("[Filters] Updated filter at index", index, "to:", filter);
			return next;
		});
	};

	const clearFilters = () => {
		const count = filters.length;
		setFilters([]);
		console.log(`[Filters] Cleared ${count} filter(s)`);
	};

	return (
		<FilterContext.Provider
			value={{
				filters,
				availableDimensions,
				addFilter,
				removeFilter,
				updateFilter,
				clearFilters,
				isLoading,
			}}
		>
			{children}
		</FilterContext.Provider>
	);
}

export function useFilters() {
	const context = useContext(FilterContext);
	if (!context) {
		throw new Error("useFilters must be used within a FilterProvider");
	}
	return context;
}


